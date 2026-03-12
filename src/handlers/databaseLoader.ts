import fs from 'fs';
import path from 'path';
import logger from './logger';
import prisma from '../db';

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
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('databaseLoader', `Database connection error: ${message}`);
    throw error;
  }
};
