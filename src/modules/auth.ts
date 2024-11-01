import { Express, Request, Response } from 'express';
import { Module } from '../handlers/moduleInit';

const authModule: Module = {
  info: {
    name: 'Auth Module',
    description:
      'This is the auth module, which is used to authenticate users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  init: (app: Express) => {
    app.get('/', (req: Request, res: Response) => {
      res.render('index', { title: 'Login' });
    });

    app.get('/example/info', (req: Request, res: Response) => {
      res.json({
        message: 'This is the info endpoint of the Example Module.',
        module: 'Example Module',
        author: 'AirLinkLab',
      });
    });
  },
};

export default authModule;
