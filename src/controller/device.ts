import config from 'config';
import { Router } from 'express';
import createHttpError from 'http-errors';
import * as log4js from 'log4js';
import { DateTime } from 'luxon';
import * as mqtt from 'mqtt';
import { IClientPublishOptions } from 'mqtt';
import { EoliaClient, EoliaOperationMode, EoliaStatus } from 'panasonic-eolia-ts';
import { getRepository, In } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';

const logger = log4js.getLogger();
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

async function getDevice(deviceId: number): Promise<Device> {
  if (isNaN(deviceId)) throw createHttpError(404);

  const device = await getRepository(Device).findOne({ where: { id: deviceId } });
  if (!device) throw createHttpError(404);

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

    publishMqtt(device, status);
    await saveDatabase(device, status);
  }

  return status;
};

async function updateEoliaStatus(device: Device, status: EoliaStatus): Promise<EoliaStatus> {
  const operation = eoliaClient.createOperation(status);
  operation.operation_token = device.token;
  status = await eoliaClient.setDeviceStatus(operation);

  publishMqtt(device, status);
  await saveDatabase(device, status);

  return status;
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

// ---- HTTP ----

function deviceController(router: Router) {

  // ---- rest ----

  /**
   * デバイス一覧
   */
  router.get('/devices', async (req, res) => {
    const deviceInfoList = await eoliaClient.getDevices();
    const devices = await getRepository(Device).find();

    res.json(devices.map(device => {
      return {
        id: device.id,
        deviceName: device.deviceName,
        info: deviceInfoList.find(dil => dil.appliance_id === device.applianceId)
      };
    }));
  });

  /**
   * デバイス詳細
   */
  router.get('/devices/:id', async (req, res) => {
    const device = await getDevice(Number(req.params.id));
    const status = await getEoliaStatus(device);

    res.json({
      id: device.id,
      deviceName: device.deviceName,
      status: status
    });
  });

  /**
   * デバイス登録
   */
  router.post('/devices', async (req, res) => {
    const repo = getRepository(Device);
    const applianceId = String(req.body.applianceId);

    const deviceInfoList = await eoliaClient.getDevices();
    const deviceInfo = deviceInfoList.find(dil => dil.appliance_id === applianceId);
    if (!deviceInfo) {
      throw createHttpError(400);
    }

    const device = repo.create({
      applianceId,
      deviceName: req.body.deviceName ?? deviceInfo.nickname
    });

    try {
      await repo.insert(device);
    } catch (err) {
      logger.error(err);
      throw createHttpError(409);
    }

    subscribeMqtt(device.id);

    res.status(201).json({
      id: device.id,
      name: device.deviceName
    });
  });

  /**
   * デバイス更新
   */
  router.put('/devices/:id', async (req, res) => {
    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(404);

    device.deviceName = req.body.deviceName;

    await getRepository(Device).save(device);

    res.status(204).send();
  });

  /**
   * デバイス削除
   */
  router.delete('/devices/:id', async (req, res) => {
    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(404);

    await getRepository(Device).delete(device.id);

    unsubscribeMqtt(device);

    res.status(204).send();
  });

  // ---- command (for Alexa) ----

  /**
   * 電源設定
   */
  router.post('/devices/:id/command/power', async (req, res) => {
    const state = String(req.body.state);
    if (state !== 'ON' && state !== 'OFF') throw createHttpError(400);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(404);

    res.status(202).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (state === 'ON') {
      if (!status.operation_status) {
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
    } else if (state === 'OFF') {
      if (status.operation_mode !== 'Stop') {
        status.operation_status = false;
        await updateEoliaStatus(device, status);
      }
    }
  });

  /**
   * モード設定
   */
  router.post('/devices/:id/command/mode', async (req, res) => {
    const mode = String(req.body.value);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(404);

    res.status(202).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (SUPPORT_MODES_ON.includes(mode)) {
      const operationStatus = mode as EoliaOperationMode;
      if (status.operation_mode !== operationStatus) {
        const deviceLog = await getRepository(DeviceStatusLog).findOne({
          where: { device, operationMode: operationStatus },
          order: { updatedAt: 'DESC' },
        });
        if (deviceLog) {
          status.temperature = deviceLog.data.temperature;
        }
        status.operation_mode = operationStatus;
        status.operation_status = true;
        await updateEoliaStatus(device, status);
      }
    } else if (SUPPORT_MODES_CLEANING.includes(mode)) {
      // 掃除中は何もしない
      if (!SUPPORT_MODES_CLEANING.includes(status.operation_mode)) {
        const operationStatus = mode as EoliaOperationMode;
        status.operation_mode = operationStatus;
        status.operation_status = false;
        await updateEoliaStatus(device, status);
      }
    } else if (SUPPORT_MODES_OFF.includes(mode)) {
      // 停止中は何もしない
      if (!SUPPORT_MODES_OFF.includes(status.operation_mode)) {
        status.operation_mode = 'Auto';
        status.operation_status = false;
        await updateEoliaStatus(device, status);
      }
    }
  });

  /**
   * 温度設定
   */
  router.post('/devices/:id/command/temperature', async (req, res) => {
    const temperature = Number(req.body.value);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(404);

    res.status(202).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (!status.operation_status) {
      // 電源が切れている場合は、モードを復元して温度設定する
      const deviceLog = await getRepository(DeviceStatusLog).findOne({
        where: { device, operationMode: In(SUPPORT_MODES_ON) },
        order: { updatedAt: 'DESC' },
      });
      if (deviceLog) {
        status.operation_mode = deviceLog.data.operation_mode;
      } else {
        status.operation_mode = 'Auto';
      }
      status.temperature = temperature;
      status.operation_status = true;
      await updateEoliaStatus(device, status);
    } else {
      // 電源が入っていても、温度の変更がない場合や温度に対応していない場合は何もしない
      if (status.temperature !== temperature && EoliaClient.isTemperatureSupport(status.operation_mode)) {
        status.temperature = temperature;
        await updateEoliaStatus(device, status);
      }
    }
  });

}

// ---- MQTT ----

const mqttClient = mqtt.connect(config.get('mqtt.broker'));

mqttClient.on('connect', async () => {
  const devices = await getRepository(Device).find();

  devices.forEach(device => subscribeMqtt(device.id));
});

mqttClient.on('message', async (topic, messageBuffer) => {
  const topicMatcher = topic.match(/^eolia\/(\d+)\/(\w+)\/set$/);
  if (!topicMatcher) {
    logger.error(topic);
    return;
  }

  const message = messageBuffer.toString();
  const deviceId = Number(topicMatcher[1]);
  const command = topicMatcher[2];

  const device = await getDevice(deviceId);
  const status = await getEoliaStatus(device);

  if (command === 'power') {
    // power_command_topic

    // TODO
  } else if (command === 'preset') {
    // preset_mode_command_topic

    // TODO
  } else if (command === 'mode') {
    // mode_command_topic

    // TODO
  } else if (command === 'temperature') {
    // temperature_command_topic
    if (!status.operation_status) {
      return;
    }

    if (message === 'low') {
      status.wind_volume = 2;
    } else if (message === 'medium') {
      status.wind_volume = 3;
    } else if (message === 'high') {
      status.wind_volume = 4;
    } else {
      status.wind_volume = 0;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'fan_mode') {
    // fan_mode_command_topic
    if (!status.operation_status) {
      return;
    }

    if (message === 'low') {
      status.wind_volume = 2;
    } else if (message === 'medium') {
      status.wind_volume = 3;
    } else if (message === 'high') {
      status.wind_volume = 4;
    } else {
      status.wind_volume = 0;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'swing_mode') {
    // swing_mode_command_topic
    if (!status.operation_status) {
      return;
    }

    status.wind_direction = message === 'on' ? 0 : 2;

    await updateEoliaStatus(device, status);
  }
});

function subscribeMqtt(deviceId: number) {
  const topicBase = `eolia/${deviceId}`;

  mqttClient.subscribe([
    `${topicBase}/power/set`,
    `${topicBase}/preset/set`,
    `${topicBase}/mode/set`,
    `${topicBase}/temperature/set`,
    `${topicBase}/fan_mode/set`,
    `${topicBase}/swing_mode/set`
  ], async err => {
    if (err) {
      logger.error(err);
    }
  });
}

function unsubscribeMqtt(device: Device) {
  const topicBase = `eolia/${device.id}`;

  mqttClient.unsubscribe([
    `${topicBase}/power/set`,
    `${topicBase}/preset/set`,
    `${topicBase}/mode/set`,
    `${topicBase}/temperature/set`,
    `${topicBase}/fan_mode/set`,
    `${topicBase}/swing_mode/set`
  ]);
}

function publishMqtt(device: Device, status: EoliaStatus) {
  const topicBase = `eolia/${device.id}`;
  const options: IClientPublishOptions = { qos: 1, retain: true };

  // power_state_topic
  mqttClient.publish(`${topicBase}/power/get`, status.operation_status ? 'on' : 'off', options);
  // preset_mode_state_topic
  mqttClient.publish(`${topicBase}/preset_mode/get`, (() => {
    if (status.ai_control === 'comfortable_econavi') {
      return 'eco';
    } else if (status.air_flow === 'powerful') {
      return 'boost';
    } else if (status.air_flow === 'quiet') {
      return 'sleep';
    } else {
      return 'comfort';
    }
  })(), options);
  // mode_state_topic
  mqttClient.publish(`${topicBase}/mode/get`, (() => {
    switch (status.operation_mode) {
    case 'Auto': // 自動
      return 'auto';
    case 'Cooling': // 冷房
      return 'cool';
    case 'Heating': // 暖房
      return 'heat';
    case 'CoolDehumidifying': // 冷房除湿
    case 'ComfortableDehumidification': // 除湿
    case 'ClothesDryer': // 衣類乾燥
      return 'dry';
    case 'Blast': // 送風
    case 'Nanoe': // ナノイー
      return 'fan_only';
    default: // off、掃除、その他
      return 'off';
    }
  })(), options);
  // temperature_state_topic
  mqttClient.publish(`${topicBase}/temperature/get`, String(status.temperature), options);
  // fan_mode_state_topic
  mqttClient.publish(`${topicBase}/fan_mode/get`, (() => {
    switch (status.wind_volume) {
    case 2:
      return 'low';
    case 3:
      return 'medium';
    case 4:
    case 5:
      return 'high';
    default:
      return 'auto';
    }
  })(), options);
  // swing_mode_state_topic
  mqttClient.publish(`${topicBase}/swing_modes/get`, status.wind_direction === 0 ? 'on' : 'off', options);
}

export default deviceController;
