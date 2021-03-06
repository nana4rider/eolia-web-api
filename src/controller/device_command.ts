import { Router } from 'express';
import PromiseRouter from 'express-promise-router';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { DateTime } from 'luxon';
import { EoliaClient, EoliaOperationMode } from 'panasonic-eolia-ts';
import { getRepository, In } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { getDevice, getEoliaStatus, powerOff, powerOn, SUPPORT_MODES_CLEANING, SUPPORT_MODES_OFF, SUPPORT_MODES_ON, updateEoliaStatus } from './common';

function deviceCommandController(router: Router) {
  const commandRouter = PromiseRouter({ mergeParams: true });
  router.use('/devices/:id/command', commandRouter);

  commandRouter.use(async (req, res, next) => {
    const id = Number(req.params.id);
    const device = await getDevice(id);
    if (!device) {
      throw createHttpError(StatusCodes.NOT_FOUND);
    }
    res.locals.device = device;
    next();
  });

  /**
   * 電源設定
   */
  commandRouter.post('/power', async (req, res) => {
    const device: Device = res.locals.device;
    const state = String(req.body.value);
    if (state !== 'ON' && state !== 'OFF' && state !== 'AUTO') {
      throw createHttpError(StatusCodes.BAD_REQUEST);
    }

    res.status(StatusCodes.ACCEPTED).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (state === 'ON') {
      await powerOn(device, status);
    } else if (state === 'OFF') {
      await powerOff(device, status);
    } else if (state === 'AUTO') {
      if (status.operation_status) return;

      let operationMode: EoliaOperationMode | undefined = undefined;
      const now = DateTime.local();

      const coolingFrom = DateTime.local(now.year, 6, 16);
      const coolingTo = DateTime.local(now.year, 9, 15);
      const heating1From = DateTime.local(now.year, 1, 1);
      const heating1To = DateTime.local(now.year, 3, 31);
      const heating2From = DateTime.local(now.year, 11, 1);
      const heating2To = DateTime.local(now.year, 12, 31);

      if (now >= coolingFrom && now <= coolingTo) {
        // 夏
        if (status.inside_temp > 28) {
          // 湿度が高い場合は冷房除湿
          if (status.inside_humidity >= 60) {
            operationMode = 'CoolDehumidifying';
          } else {
            operationMode = 'Cooling';
          }
        }
      } else if ((now >= heating1From && now <= heating1To)
        || (now >= heating2From && now <= heating2To)) {
        // 冬
        if (status.inside_temp < 20) {
          operationMode = 'Heating';
        }
      }

      if (!operationMode) {
        return;
      }

      // 電源が切れている場合は、モードを復元して温度設定する
      const deviceLog = await getRepository(DeviceStatusLog).findOne({
        where: { device, operationMode: operationMode }
      });
      if (deviceLog) {
        status.temperature = deviceLog.data.temperature;
      }

      status.operation_mode = operationMode;
      status.operation_status = true;

      await updateEoliaStatus(device, status);
    }
  });

  /**
   * モード設定
   */
  commandRouter.post('/mode', async (req, res) => {
    const device: Device = res.locals.device;
    const mode = String(req.body.value);

    res.status(StatusCodes.ACCEPTED).send();

    // 更新処理は非同期
    const status = await getEoliaStatus(device);

    if (SUPPORT_MODES_ON.includes(mode)) {
      const operationMode = mode as EoliaOperationMode;
      if (status.operation_mode !== operationMode) {
        const deviceLog = await getRepository(DeviceStatusLog).findOne({
          where: { device, operationMode: operationMode }
        });
        if (deviceLog) {
          status.temperature = deviceLog.data.temperature;
        }
        status.operation_mode = operationMode;
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
  commandRouter.post('/temperature', async (req, res) => {
    const device: Device = res.locals.device;
    const temperature = Number(req.body.value);

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
