import { Router, Request, Response, NextFunction } from 'express';
import { Module } from '../../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    let validKeys: string[] = [];

    async function loadApiKeys() {
      try {
        const keys = await prisma.apiKey.findMany();
        validKeys = keys.map((key) => key.key);
      } catch (error) {
        console.error('Error loading API keys:', error);
      }
    }

    async function validator(req: Request, res: Response, next: NextFunction) {
      await loadApiKeys();
      const apiKey = req.headers['api-key'] as string;
      if (validKeys.includes(apiKey)) {
        next();
      } else {
        console.log('Invalid API key:', apiKey);
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
      }
    }

    const router = Router();

    // here we do the API stuff

    return router;
  },
};

export default coreModule;
