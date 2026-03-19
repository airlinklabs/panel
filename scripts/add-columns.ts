/**
 * node -r ts-node/register scripts/add-columns.ts
 * OR after build: node scripts/add-columns.js
 *
 * Adds all new columns to an existing database without touching existing data.
 * Safe to run multiple times — checks PRAGMA table_info before each ALTER.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const columns: { table: string; name: string; def: string }[] = [
  { table: 'settings', name: 'loginWallpaper',      def: 'TEXT' },
  { table: 'settings', name: 'registerWallpaper',   def: 'TEXT' },
  { table: 'settings', name: 'loginMaxAttempts',    def: 'INTEGER NOT NULL DEFAULT 5' },
  { table: 'settings', name: 'loginLockoutMinutes', def: 'INTEGER NOT NULL DEFAULT 15' },
  { table: 'settings', name: 'enforceDaemonHttps',  def: 'BOOLEAN NOT NULL DEFAULT false' },
  { table: 'settings', name: 'behindReverseProxy',  def: 'BOOLEAN NOT NULL DEFAULT false' },
  { table: 'settings', name: 'hashApiKeys',         def: 'BOOLEAN NOT NULL DEFAULT false' },
  { table: 'Users',    name: 'loginAttempts',       def: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'Users',    name: 'lockedUntil',         def: 'DATETIME' },
];

async function main() {
  for (const col of columns) {
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info("${col.table}")`
    );
    const exists = rows.some((r: any) => r.name === col.name);
    if (exists) {
      console.log(`  skip  ${col.table}.${col.name}`);
    } else {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${col.table}" ADD COLUMN "${col.name}" ${col.def}`
      );
      console.log(`  added ${col.table}.${col.name}`);
    }
  }
  console.log('\nDone. Run: npx prisma generate && npm run build');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
