import config from 'config';
import PromiseRouter from 'express-promise-router';
import createHttpError from 'http-errors';
import { EoliaClient } from 'panasonic-eolia-ts';
import Context from '../Context';

const { app } = Context;

const rootRouter = PromiseRouter();
const client = new EoliaClient(config.get('eolia.userId'), config.get('eolia.password'));
const applianceIds: Record<string, string> = config.get('device.applianceIds');
const deviceNames = Object.keys(applianceIds).reduce((dict, name) => {
  dict[applianceIds[name]] = name;
  return dict;
}, {} as Record<string, string>);

/**
 * デバイス一覧
 */
rootRouter.get('/devices', async (req, res) => {
  const devices = await client.getDevices();

  res.json(devices.map(device => {
    return {
      name: deviceNames[device.appliance_id],
      nickname: device.nickname,
      purchaseDate: device.purchase_date,
      productCode: device.product_code
    };
  }));
});

/**
 * 電源
 */
rootRouter.get('/power/:deviceName', async (req, res) => {
  const deviceName = req.params.deviceName;
  if (!applianceIds[deviceName]) {
    throw createHttpError(404);
  }
  const applianceId = applianceIds[deviceName];
  const deviceStatus = await client.getDeviceStatus(applianceId);

  res.json({
    power: deviceStatus.operation_status
  });
});

app.use('/', rootRouter);

/**
 * 温湿度計
 */
rootRouter.get('/thermohygrometer/:deviceName', async (req, res) => {
  const deviceName = req.params.deviceName;
  if (!applianceIds[deviceName]) {
    throw createHttpError(404);
  }
  const applianceId = applianceIds[deviceName];
  const deviceStatus = await client.getDeviceStatus(applianceId);

  res.json({
    temperature: deviceStatus.inside_temp,
    humidity: deviceStatus.inside_humidity
  });
});
