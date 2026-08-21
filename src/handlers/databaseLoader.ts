import logger from './logger';
import prisma from '../db';

export const databaseLoader = async () => {
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
