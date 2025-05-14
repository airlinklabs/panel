/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import fs from 'fs';
import path from 'path';
import logger from './logger';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const databaseLoader = async () => {
  const dbPath = path.join(__dirname, '../../prisma/dev.db');

  if (!fs.existsSync(dbPath)) {
    logger.error('databaseLoader', `Database not found at location: ${dbPath}`);
    throw new Error('Database file not found');
  }

  try {
    await prisma.$connect();
    logger.info('Database connected');

    await prisma.$queryRaw`SELECT 1`;

    return prisma;
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(
        'databaseLoader',
        `Database connection error: ${error.message}`,
      );
    } else {
      logger.error(
        'databaseLoader',
        'Database connection error: Unknown error occurred',
      );
    }
    throw error;
  }
};
