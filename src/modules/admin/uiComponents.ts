import { Module } from '../../handlers/moduleInit';
import { uiComponentStore } from '../../handlers/uiComponentHandler';
import { Router } from 'express';

const uiComponentsModule: Module = {
  router: () => {



    // Return an empty router since this module only registers UI components
    return Router();
  },
};

export default uiComponentsModule;
