import config from 'config';
import { DateTime } from 'luxon';
import { EoliaClient, EoliaStatus } from 'panasonic-eolia-ts';
import { getRepository, In } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { publishMqtt } from './mqtt';

const eoliaClient = new EoliaClient(config.get('eolia.userId'), config.get('eolia.password'));

const SUPPORT_MODES_ON = [
  'Auto',
  'Cooling',
  'Heating',
  'CoolDehumidifying',
  'ClothesDryer',
  'Blast'
];

const SUPPORT_MODES_CLEANING = [
  'NanoexCleaning',
  'Cleaning'
];

const SUPPORT_MODES_OFF = [
  'Stop'
];

async function getDevice(deviceId: number): Promise<Device | undefined> {
  if (isNaN(deviceId)) {
    return undefined;
  }

  const device = await getRepository(Device).findOne({ where: { id: deviceId } });

  return device;
}

async function getEoliaStatus(device: Device): Promise<EoliaStatus> {
  const tokenExpire = device.tokenExpire;
  let status: EoliaStatus | undefined;

  if (tokenExpire && tokenExpire.diffNow().milliseconds >= 0) {
    // トークンの期限が有効である場合、他端末で更新できないのでDBの値を利用する
    const statusLog = await getRepository(DeviceStatusLog).findOne({
      where: { device },
      order: { updatedAt: 'DESC' },
    });
    if (statusLog) {
      status = statusLog.data;
    }
  }

  if (!status) {
    status = await eoliaClient.getDeviceStatus(device.applianceId);

    await saveDatabase(device, status);
  }

  return status;
};

const updateLock = new Set<number>();

async function updateEoliaStatus(device: Device, status: EoliaStatus): Promise<EoliaStatus> {
  const deviceId = device.id;
  if (updateLock.has(deviceId)) {
    throw new Error('Updating');
  }

  try {
    updateLock.add(deviceId);
    // 更新に時間がかかるため更新前にも配信する
    publishMqtt(device, status);

    const operation = eoliaClient.createOperation(status);
    operation.operation_token = device.token;
    status = await eoliaClient.setDeviceStatus(operation);

    publishMqtt(device, status);
    await saveDatabase(device, status);

    return status;
  } finally {
    updateLock.delete(deviceId);
  }
};

async function saveDatabase(device: Device, status: EoliaStatus) {
  const repoLog = getRepository(DeviceStatusLog);

  let deviceStatus = await repoLog.findOne({
    where: {
      device,
      operationMode: status.operation_mode
    }
  });
  if (!deviceStatus) {
    deviceStatus = repoLog.create({ device });
  }
  deviceStatus.data = status;

  await repoLog.save(deviceStatus);

  // トークンを更新
  if (status.operation_token) {
    const repoDev = getRepository(Device);

    device.token = status.operation_token;
    device.tokenExpire = DateTime.local().plus(EoliaClient.OPERATION_TOKEN_LIFETIME);
    device.deviceStatusLogs = undefined;

    await repoDev.save(device);
  }
}

async function powerOn(device: Device, status: EoliaStatus) {
  if (status.operation_status) return;

  const deviceLog = await getRepository(DeviceStatusLog).findOne({
    where: { device, operationMode: In(SUPPORT_MODES_ON) },
    order: { updatedAt: 'DESC' },
  });

  if (deviceLog) {
    status.operation_mode = deviceLog.data.operation_mode;
    status.temperature = deviceLog.data.temperature;
  } else {
    status.operation_mode = 'Auto';
    status.temperature = 20;
  }
  status.operation_status = true;
  await updateEoliaStatus(device, status);
}

async function powerOff(device: Device, status: EoliaStatus) {
  if (SUPPORT_MODES_OFF.includes(status.operation_mode)) return;

  status.operation_mode = 'Auto';
  status.operation_status = false;
  await updateEoliaStatus(device, status);
}

export {
  eoliaClient,
  getDevice, getEoliaStatus, updateEoliaStatus,
  powerOn, powerOff,
  SUPPORT_MODES_ON, SUPPORT_MODES_CLEANING, SUPPORT_MODES_OFF
};

