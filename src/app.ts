import config from 'config';
import express, { NextFunction, Request, Response } from 'express';
import { HttpError } from 'http-errors';
import * as log4js from 'log4js';
import * as luxon from 'luxon';
import { createConnection } from 'typeorm';
import * as log4jconfig from './config/log4js';
import * as ormconfig from './config/ormconfig';
import router from './router';

// Luxon
const locale: string = config.get('date.locale');
const timezone: string = config.get('date.timezone');
luxon.Settings.defaultLocale = locale;
luxon.Settings.defaultZone = timezone;
luxon.Settings.throwOnInvalid = true;

// log4js
log4js.configure(log4jconfig.configures[config.get('env') as string]);
const logger = log4js.getLogger();
const accessLogger = log4js.getLogger('access');

process.on('unhandledRejection', (reason, p) => {
  logger.error('Unhandled Rejection at:', p, 'reason:', reason);
});

void (async () => {
  // typeorm
  await createConnection(ormconfig);
  logger.info('- Connection created -');

  // Express
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(log4js.connectLogger(accessLogger, { level: 'INFO' }));
  app.use('/', router());

  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(error);

    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof HttpError) {
      res.status(error.statusCode);
      res.send({ message: error.message });
    } else {
      res.status(500);
      res.send({ message: 'エラーが発生しました。' });
    }
  });

  app.listen(config.get('server.port'), () => {
    logger.info('- HTTP Server Start -');
  });
})();
