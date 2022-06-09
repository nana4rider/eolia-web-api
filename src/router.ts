import config from 'config';
import PromiseRouter from 'express-promise-router';
import createHttpError from 'http-errors';
import passport from 'passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import deviceController from './controller/device';

export default () => {
  const router = PromiseRouter();
  const apikey = config.get('rest.apikey');

  passport.use(new HeaderAPIKeyStrategy(
    { header: 'Authorization', prefix: 'Api-Key ' }, false,
    (inputkey, done) => {
      if (apikey && inputkey !== apikey) {
        done(createHttpError(401));
      } else {
        done(null, true);
      }
    }
  ));
  router.use('/', passport.authenticate('headerapikey', { session: false }));

  deviceController(router);

  return router;
};
