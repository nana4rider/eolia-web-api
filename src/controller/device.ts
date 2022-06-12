import { Router } from 'express';
import PromiseRouter from 'express-promise-router';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import * as log4js from 'log4js';
import { getRepository, In } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { eoliaClient, getDevice, getEoliaStatus, SUPPORT_MODES_ON } from './common';
import { publishMqtt, subscribeMqtt, unsubscribeMqtt } from './mqtt';

const logger = log4js.getLogger();

function deviceController(router: Router) {
  const idRouter = PromiseRouter({ mergeParams: true });
  router.use('/devices/:id', idRouter);

  idRouter.use(async (req, res, next) => {
    const id = Number(req.params.id);
    const device = await getDevice(id);
    if (!device) {
      throw createHttpError(StatusCodes.NOT_FOUND);
    }
    res.locals.device = device;
    next();
  });

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
  idRouter.get(/.*/, async (req, res) => {
    const device: Device = res.locals.device;

    const status = await getEoliaStatus(device);

    publishMqtt(device, status);

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
  idRouter.put(/.*/, async (req, res) => {
    const device: Device = res.locals.device;

    device.deviceName = req.body.deviceName;

    await getRepository(Device).save(device);

    res.status(StatusCodes.NO_CONTENT).send();
  });

  /**
   * デバイス削除
   */
  idRouter.delete(/.*/, async (req, res) => {
    const device: Device = res.locals.device;

    await getRepository(Device).delete(device.id);

    unsubscribeMqtt(device);

    res.status(StatusCodes.NO_CONTENT).send();
  });
}

export default deviceController;
