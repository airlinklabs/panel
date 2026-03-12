import logger from './logger';
import prisma from '../db';

export const settingsLoader = async () => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    if (!settings) {
      await prisma.settings.create({
        data: {
          title: 'AirLink',
          description: 'AirLink is a free and open source project by AirlinkLabs',
          logo: '../assets/logo.png',
          theme: 'default',
          language: 'en',
          allowRegistration: false,
        },
      });
      logger.info('Settings created');
    }

    return prisma;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('settingsLoader', `Database connection error: ${message}`);
    throw error;
  }
};
