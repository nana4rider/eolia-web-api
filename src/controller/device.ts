import { Router } from 'express';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import * as log4js from 'log4js';
import { getRepository, In } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { eoliaClient, getDevice, getEoliaStatus, SUPPORT_MODES_ON } from './common';
import { subscribeMqtt, unsubscribeMqtt } from './mqtt';

const logger = log4js.getLogger();

function deviceController(router: Router) {
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
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);
    const status = await getEoliaStatus(device);

    const deviceLog = await getRepository(DeviceStatusLog).findOne({
      where: { device, operationMode: In(SUPPORT_MODES_ON) },
      order: { updatedAt: 'DESC' },
    });

    res.json({
      id: device.id,
      deviceName: device.deviceName,
      status: status,
      lastMode: deviceLog ? deviceLog.data.operation_mode : null
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
      throw createHttpError(StatusCodes.BAD_REQUEST);
    }

    const device = repo.create({
      applianceId,
      deviceName: req.body.deviceName ?? deviceInfo.nickname
    });

    try {
      await repo.insert(device);
    } catch (err) {
      logger.error(err);
      throw createHttpError(StatusCodes.CONFLICT);
    }

    subscribeMqtt(device.id);

    res.status(StatusCodes.CREATED).json({
      id: device.id,
      name: device.deviceName
    });
  });

  /**
   * デバイス更新
   */
  router.put('/devices/:id', async (req, res) => {
    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);

    device.deviceName = req.body.deviceName;

    await getRepository(Device).save(device);

    res.status(StatusCodes.NO_CONTENT).send();
  });

  /**
   * デバイス削除
   */
  router.delete('/devices/:id', async (req, res) => {
    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);

    await getRepository(Device).delete(device.id);

    unsubscribeMqtt(device);

    res.status(StatusCodes.NO_CONTENT).send();
  });
}

export default deviceController;
