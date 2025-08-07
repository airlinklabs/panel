import { Module } from '../../handlers/moduleInit';
import { uiComponentStore } from '../../handlers/uiComponentHandler';
import { Router } from 'express';

const uiComponentsModule: Module = {
  info: {
    name: 'Admin UI Components Module',
    description: 'This file registers UI components for the admin panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {



    // Return an empty router since this module only registers UI components
    return Router();
  },
};

export default uiComponentsModule;
