import logger from './logger';
import prisma from '../db';

const SESSION_WRITE_TEST_ID = '__database_loader_write_test__';

async function assertDatabaseWritable() {
  await prisma.session.upsert({
    where: { session_id: SESSION_WRITE_TEST_ID },
    update: {
      data: '{}',
      expires: new Date(),
    },
    create: {
      session_id: SESSION_WRITE_TEST_ID,
      data: '{}',
      expires: new Date(),
    },
  });

  await prisma.session.delete({
    where: { session_id: SESSION_WRITE_TEST_ID },
  });
}

export const databaseLoader = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    await prisma.$queryRaw`SELECT 1`;
    await assertDatabaseWritable();
    return prisma;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('databaseLoader', `Database connection error: ${message}`);
    throw error;
  }
};
