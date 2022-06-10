import { Router } from 'express';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { EoliaClient, EoliaOperationMode } from 'panasonic-eolia-ts';
import { getRepository, In } from 'typeorm';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { getDevice, getEoliaStatus, powerOff, powerOn, SUPPORT_MODES_CLEANING, SUPPORT_MODES_OFF, SUPPORT_MODES_ON, updateEoliaStatus } from './common';

function deviceCommandController(router: Router) {
  /**
   * 電源設定
   */
  router.post('/devices/:id/command/power', async (req, res) => {
    const state = String(req.body.value);
    if (state !== 'ON' && state !== 'OFF') throw createHttpError(StatusCodes.BAD_REQUEST);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);

    res.status(StatusCodes.ACCEPTED).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (state === 'ON') {
      await powerOn(device, status);
    } else if (state === 'OFF') {
      await powerOff(device, status);
    }
  });

  /**
   * モード設定
   */
  router.post('/devices/:id/command/mode', async (req, res) => {
    const mode = String(req.body.value);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);

    res.status(StatusCodes.ACCEPTED).send();

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
      await powerOff(device, status);
    }
  });

  /**
   * 温度設定
   */
  router.post('/devices/:id/command/temperature', async (req, res) => {
    const temperature = Number(req.body.value);

    const device = await getDevice(Number(req.params.id));
    if (!device) throw createHttpError(StatusCodes.NOT_FOUND);

    res.status(StatusCodes.ACCEPTED).send();

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

export default deviceCommandController;
