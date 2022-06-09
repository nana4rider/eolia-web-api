import config from 'config';
import * as log4js from 'log4js';
import { ConnectionOptions } from 'typeorm';
import { Log4jsLogger, NamingStrategy } from 'typeorm-util-ts';

let database;
const nodeEnv: string = config.get('env');
switch (nodeEnv) {
case 'development':
case 'production':
  // NODE_ENV=development,production
  database = '.data/sqlite3.db';
  break;
default:
  throw new Error('NODE_ENV=' + nodeEnv);
}

const ormconfig: ConnectionOptions = {
  type: 'sqlite',
  database: database,
  synchronize: false,
  entities: ['dst/entity/*.js'],
  migrations: ['dst/typeorm/migration/*.js'],
  cli: {
    migrationsDir: 'src/typeorm/migration'
  },
  logger: new Log4jsLogger(log4js.getLogger('sql')),
  namingStrategy: new NamingStrategy()
};

export = ormconfig;
