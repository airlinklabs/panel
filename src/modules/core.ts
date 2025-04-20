import { Router } from 'express';
import { Module } from '../handlers/moduleInit';

const coreModule: Module = {
  info: {
    name: 'Core Module',
    description: 'This file is for all core functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // ok what will go here?

    // many things

    return router;
  },
};

export default coreModule;
