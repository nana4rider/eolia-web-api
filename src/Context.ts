import express from 'express';

class Context {
  constructor(public app: express.Application) {
  }
}

const app = express();

// export as singleton
export default new Context(app);
