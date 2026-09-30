#!/usr/bin/env node
/**
 * db-reset.mjs — Nuclear database + Redis reset.
 *
 * Drops the database and role, recreates both with fresh credentials,
 * flushes Redis, runs prisma generate + migrate dev, and rewrites .env
 * with the new password and a fresh SESSION_SECRET.
 *
 * Flags:
 *   --yes / -y       Skip confirmation prompt.
 *   --no-migrate     Skip prisma generate + migrate after reset.
 *   --help / -h      Show help.
 *
 * Usage:
 *   node scripts/db-reset.mjs
 *   node scripts/db-reset.mjs --yes
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger, box, confirm, spinner, doubleBox } from './ui.mjs';
import {
  runAsSuper,
  runAsSuperDb,
  dropRoleCleanly,
  detectMethod,
} from './pg-super.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, '..');

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

const opts = {
  yes: argv.includes('--yes') || argv.includes('-y'),
  noMigrate: argv.includes('--no-migrate'),
  help: argv.includes('--help') || argv.includes('-h'),
};

// ── Help ──────────────────────────────────────────────────────────────────────

function showHelp() {
  box('db-reset.mjs — Nuclear database + Redis reset', [
    '',
    '  node scripts/db-reset.mjs [flags]',
    '',
    '  --yes, -y       Skip confirmation prompt',
    '  --no-migrate    Skip prisma generate + migrate after reset',
    '  --help, -h      Show this message',
    '',
    '  What it does:',
    '    1. Drops all owned objects and revokes privileges',
    '    2. Drops the PostgreSQL role',
    '    3. Drops the database',
    '    4. Generates a fresh DB password + SESSION_SECRET',
    '    5. Recreates the role with login + createdb',
    '    6. Recreates the database with the role as owner',
    '    7. Grants full database privileges',
    '    8. Flushes all Redis data',
    '    9. Rewrites .env with new credentials',
    '   10. Runs prisma generate + migrate dev',
  ]).forEach((l) => console.log(l));
  process.exit(0);
}

// ── .env helpers ──────────────────────────────────────────────────────────────

function readEnv() {
  const envPath = resolve(projectDir, '.env');
  if (!existsSync(envPath)) {return {};}
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {continue;}
    const eq = t.indexOf('=');
    if (eq === -1) {continue;}
    env[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return env;
}

function parseDatabaseUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!m) {return null;}
  return { user: m[1], pass: m[2], host: m[3], port: m[4], db: m[5] };
}

function genSecret() {
  return randomBytes(48).toString('hex');
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', cwd: projectDir });
  } catch {
    return null;
  }
}

/**
 * Rewrite .env with new DB password and fresh SESSION_SECRET.
 * Preserves all other settings (PORT, URL, SMTP, etc.).
 */
function rewriteEnv(old, newPass) {
  const envPath = resolve(projectDir, '.env');
  const db = parseDatabaseUrl(old.DATABASE_URL || '');
  const host = db?.host || '127.0.0.1';
  const port = db?.port || '5432';
  const name = db?.db || 'airlink';
  const user = db?.user || 'airlink';
  const newSecret = genSecret();

  const lines = [
    '#',
    '# Airlink Panel — environment configuration',
    `# Rewritten by db-reset.mjs on ${new Date().toISOString()}`,
    '#',
    '',
    '# ── Core ────────────────────────────────────────────────────────────────────',
    `URL="${old.URL || 'http://localhost:3000'}"`,
    `PORT="${old.PORT || '3000'}"`,
    `NAME="${old.NAME || 'katharos'}"`,
    `NODE_ENV="${old.NODE_ENV || 'development'}"`,
    '',
    '# ── Session ──────────────────────────────────────────────────────────────────',
    `SESSION_SECRET="${newSecret}"`,
    '# SESSION_MAX_AGE_MS=604800000',
    '',
    '# ── Reverse Proxy / HTTPS ────────────────────────────────────────────────────',
    `TRUST_PROXY="${old.TRUST_PROXY || ''}"`,
    `COOKIE_DOMAIN="${old.COOKIE_DOMAIN || ''}"`,
    '',
    '# ── Asset Delivery ───────────────────────────────────────────────────────────',
    `ASSET_URL="${old.ASSET_URL || ''}"`,
    `ASSET_BASE_URL="${old.ASSET_BASE_URL || ''}"`,
    '',
    '# ── Content Security Policy ──────────────────────────────────────────────────',
    `CSP_ENABLED="${old.CSP_ENABLED || ''}"`,
    '',
    '# ── Rate Limiting ────────────────────────────────────────────────────────────',
    `RATE_LIMIT_MAX=${old.RATE_LIMIT_MAX || '100'}`,
    '# RATE_LIMIT_WINDOW_MS=60000',
    '',
    '# ── Logging ──────────────────────────────────────────────────────────────────',
    `LOG_LEVEL="${old.LOG_LEVEL || 'info'}"`,
    '',
    '# ── Storage ──────────────────────────────────────────────────────────────────',
    '# STORAGE_DIR=""',
    '',
    '# ── Database (Prisma) ────────────────────────────────────────────────────────',
    `DATABASE_URL="postgresql://${user}:${newPass}@${host}:${port}/${name}"`,
    'DB_POOL_MAX=20',
    '',
    '# ── Database (raw credentials) ───────────────────────────────────────────────',
    `PGHOST="${host}"`,
    `PGPORT="${port}"`,
    `PGUSER="${user}"`,
    `PGPASSWORD="${newPass}"`,
    '',
    '# ── Redis ────────────────────────────────────────────────────────────────────',
    `REDIS_URL="${old.REDIS_URL || 'redis://127.0.0.1:6379'}"`,
    'ALLOWED_ORIGINS="0.0.0.0"',
    '',
    '# ── TLS (direct HTTPS without a reverse proxy) ───────────────────────────────',
    '# TLS_CERT_PATH=""',
    '# TLS_KEY_PATH=""',
    '',
    '# ── SMTP / Email ─────────────────────────────────────────────────────────────',
    `SMTP_HOST="${old.SMTP_HOST || ''}"`,
    `SMTP_PORT=${old.SMTP_PORT || '587'}`,
    `SMTP_USER="${old.SMTP_USER || ''}"`,
    `SMTP_PASS="${old.SMTP_PASS || ''}"`,
    '# SMTP_FROM="no-reply@example.com"',
    '# SMTP_SECURE="true"',
    '',
  ];

  writeFileSync(envPath, lines.join('\n'), 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (opts.help) {showHelp();}

  // Warning banner
  const warning = doubleBox('!! DESTRUCTIVE OPERATION !!', [
    '',
    'This will PERMANENTLY DELETE and REBUILD:',
    '',
    '  \u2022  The entire airlink PostgreSQL database',
    '  \u2022  The PostgreSQL role and all owned objects',
    '  \u2022  All Redis session and cache data',
    '',
    '  A new DB password and SESSION_SECRET will be generated.',
    '  .env will be rewritten with the fresh credentials.',
    '',
    'There is NO undo for this action.',
  ]);
  console.log();
  warning.forEach((l) => console.log(l));
  Logger.gap();

  // Load .env
  const env = readEnv();
  if (!env.DATABASE_URL) {
    Logger.fail('DATABASE_URL not found in .env');
    process.exit(1);
  }

  const db = parseDatabaseUrl(env.DATABASE_URL);
  if (!db) {
    Logger.fail('Could not parse DATABASE_URL');
    process.exit(1);
  }

  const redisUrl = env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redisMatch = redisUrl.match(/^redis:\/\/([^:]+):(\d+)$/);
  const redisHost = redisMatch?.[1] ?? '127.0.0.1';
  const redisPort = redisMatch?.[2] ?? '6379';

  Logger.info(`Database  ${db.host}:${db.port}/${db.db}  (role: ${db.user})`);
  Logger.info(`Redis     ${redisHost}:${redisPort}`);
  Logger.gap();

  // Confirm
  if (!opts.yes) {
    const go = await confirm(
      'PERMANENTLY destroy all data and rebuild from scratch?',
      false,
    );
    if (!go) {
      Logger.warn('Aborted');
      process.exit(0);
    }
  }

  Logger.gap();

  // Generate fresh credentials
  const newPass = genSecret().slice(0, 32);
  const newSecret = genSecret();

  // Detect sudo
  Logger.section('Superuser access');
  try {
    const m = await detectMethod();
    Logger.ok(
      m === 'nopasswd' ? 'NOPASSWD sudo configured' : 'Sudo with password',
    );
  } catch (e) {
    Logger.fail(e.message);
    process.exit(1);
  }

  // Step 1: drop database
  Logger.section('Drop');
  await spinner('Dropping database', async () => {
    const r = await runAsSuper(`DROP DATABASE IF EXISTS ${db.db}`);
    if (!r.ok) {Logger.warn('Database drop reported an error — continuing');}
  });

  await spinner(`Dropping role '${db.user}'`, async () => {
    const r = await dropRoleCleanly(db.user);
    if (!r.ok) {Logger.warn('Role drop reported an error — continuing');}
  });

  // Step 2: recreate with fresh password
  Logger.section('Recreate');
  await spinner('Creating role with new password', async () => {
    const r = await runAsSuper(
      `CREATE ROLE ${db.user} WITH LOGIN PASSWORD '${newPass}' CREATEDB`,
    );
    if (!r.ok) {throw new Error(`Failed to create role: ${r.output}`);}
  });

  await spinner('Creating database', async () => {
    const r = await runAsSuper(`CREATE DATABASE ${db.db} OWNER ${db.user}`);
    if (!r.ok) {throw new Error(`Failed to create database: ${r.output}`);}
  });

  await spinner('Granting privileges', async () => {
    await runAsSuper(`GRANT ALL PRIVILEGES ON DATABASE ${db.db} TO ${db.user}`);
    await runAsSuperDb(`GRANT USAGE ON SCHEMA public TO ${db.user}`, db.db);
    await runAsSuperDb(`GRANT CREATE ON SCHEMA public TO ${db.user}`, db.db);
    await runAsSuperDb(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db.user}`,
      db.db,
    );
    await runAsSuperDb(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db.user}`,
      db.db,
    );
  });

  // Step 3: flush Redis
  Logger.section('Redis');
  await spinner('Flushing Redis', async () => {
    const result = run(`redis-cli -h ${redisHost} -p ${redisPort} FLUSHALL`);
    if (result?.trim() !== 'OK')
    {Logger.warn('Redis may not be running — continuing');}
  });

  // Step 4: rewrite .env
  Logger.section('Environment');
  rewriteEnv(env, newPass);
  Logger.ok('.env rewritten with new DB password + fresh SESSION_SECRET');
  Logger.dim(`DB password: ${newPass.slice(0, 8)}...`);
  Logger.dim(`Session key: ${newSecret.slice(0, 8)}...`);

  // Step 5: Prisma
  if (!opts.noMigrate) {
    Logger.section('Prisma');
    await spinner('prisma generate', async () => {
      const r = run('npx prisma generate');
      if (r === null) {throw new Error('prisma generate failed');}
    });

    await spinner('prisma migrate dev', async () => {
      const r = run('npx prisma migrate dev');
      if (r === null) {throw new Error('prisma migrate dev failed');}
    });
  }

  // Done
  Logger.gap();
  Logger.ok('Reset complete. Fresh DB, role, Redis, and .env.');
  if (!opts.noMigrate) {Logger.ok('Schema migrations applied.');}
}

main().catch((err) => {
  Logger.fail(err.message || String(err));
  process.exit(1);
});
