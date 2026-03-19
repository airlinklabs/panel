/**
 * Run this with: node scripts/add-columns.js
 *
 * Adds all new columns to an existing database without touching existing data.
 * Safe to run multiple times — silently skips columns that already exist.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found at', dbPath);
  console.error('If your DB is elsewhere, edit the dbPath in this script.');
  process.exit(1);
}

const db = new Database(dbPath);

const columns = [
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

for (const col of columns) {
  const existing = db.prepare(`PRAGMA table_info("${col.table}")`).all();
  const exists = existing.some(c => c.name === col.name);
  if (exists) {
    console.log(`  skip  ${col.table}.${col.name} (already exists)`);
  } else {
    db.prepare(`ALTER TABLE "${col.table}" ADD COLUMN "${col.name}" ${col.def}`).run();
    console.log(`  added ${col.table}.${col.name}`);
  }
}

db.close();
console.log('\nDone. Restart the panel.');
