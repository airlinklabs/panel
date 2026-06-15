import { PrismaClient } from './generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import fs from 'fs';
import path from 'path';

// Load .env early so DATABASE_URL is available when the adapter is created.
const envPath = path.resolve(process.cwd(), '.env');
try {
  const data = fs.readFileSync(envPath, 'utf8');
  for (const line of data.split('\n')) {
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env may not exist in all environments
}

// Resolve DATABASE_URL to an absolute path so Prisma CLI and the runtime adapter
// always use the same SQLite file. Without this, `prisma db push` and the runtime
// can resolve `file:./storage/dev.db` to different directories.
function resolveDbUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw;
  const relPath = raw.slice('file:'.length);
  const absPath = path.resolve(process.cwd(), relPath);
  // Ensure the parent directory exists (e.g. storage/)
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return `file:${absPath}`;
}

const rawUrl = process.env.DATABASE_URL || 'file:./storage/dev.db';
const resolvedUrl = resolveDbUrl(rawUrl);

const adapter = new PrismaBetterSqlite3({ url: resolvedUrl });
const prisma = new PrismaClient({ adapter });

export default prisma;
