/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { PrismaClient } from '@prisma/client';
import logger from './logger';

const prisma = new PrismaClient();

/**
 * Creates the PlayerStats table if it doesn't exist
 */
export async function createPlayerStatsTable(): Promise<void> {
  try {
    // Check if the table exists
    const tableExists = await checkIfTableExists('PlayerStats');

    if (!tableExists) {
      logger.info('Creating PlayerStats table...');

      // Create the table using raw SQL
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlayerStats" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "totalPlayers" INTEGER NOT NULL DEFAULT 0,
          "maxPlayers" INTEGER NOT NULL DEFAULT 0,
          "onlineServers" INTEGER NOT NULL DEFAULT 0,
          "totalServers" INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Create index
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PlayerStats_timestamp_idx" ON "PlayerStats"("timestamp");
      `);

      logger.info('PlayerStats table created successfully');
    } else {
      logger.debug('PlayerStats table already exists');
    }
  } catch (error) {
    logger.error('Error creating PlayerStats table:', error);
  }
}

/**
 * Checks if a table exists in the database
 */
async function checkIfTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';
    `);

    return result.length > 0;
  } catch (error) {
    logger.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}
