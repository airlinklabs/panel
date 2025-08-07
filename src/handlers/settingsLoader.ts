/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import logger from './logger';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const settingsLoader = async () => {
  try {
    await prisma.$connect();

    /*
     * All settings
     *
     * Title
     * Description
     * Favicon
     * Logo
     * Theme
     * Language
     *
     */

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    if (!settings) {
      await prisma.settings.create({
        data: {
          title: 'AirLink',
          description:
            'AirLink is a free and open source project by AirlinkLabs',
          logo: '../assets/logo.png',
          theme: 'default',
          language: 'en',
          allowRegistration: false,
        },
      });
      logger.info('Settings created');

      return prisma;
    }
    return prisma;
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        'settingsLoader',
        `Database connection error: ${error.message}`,
      );
    } else {
      logger.error(
        'settingsLoader',
        'Database connection error: Unknown error occurred',
      );
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};
