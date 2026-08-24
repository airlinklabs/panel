import { PrismaClient } from './generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import fs from 'fs';
import path from 'path';
import logger from './handlers/logger';

// Load .env early so DATABASE_URL is available when the adapter is created.
const envPath = path.resolve(process.cwd(), '.env');
try {
  const data = fs.readFileSync(envPath, 'utf8');
  for (const line of data.split('\n')) {
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {continue;}
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env may not exist in all environments
}

const databaseUrl = process.env.DATABASE_URL || 'mysql://root:@127.0.0.1:3306/airlink';

// PrismaMariaDb accepts either a connection URL string or a PoolConfig object.
// Pass the URL directly — the adapter creates its own connection pool internally.
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

export default prisma;
