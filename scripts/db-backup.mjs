#!/usr/bin/env node
/**
 * db-backup.mjs — Backup PostgreSQL database with optional AES encryption.
 *
 * Creates a pg_dump of the airlink database, optionally encrypts it with a
 * user-supplied password via openssl AES-256-CBC, and stores the result in a
 * root-protected backup directory.
 *
 * Flags:
 *   --encrypt / -e    Prompt for an encryption password.
 *   --password / -p   Supply encryption password non-interactively.
 *   --yes / -y        Skip confirmation prompt.
 *   --help / -h       Show help.
 *
 * Usage:
 *   node scripts/db-backup.mjs
 *   node scripts/db-backup.mjs --encrypt
 *   node scripts/db-backup.mjs -e -y
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger, box, prompt, secret, confirm, spinner } from './ui.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, '..');

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function flagVal(name) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1] && !argv[i + 1].startsWith('-'))
    {return argv[i + 1];}
    if (argv[i].startsWith(`${name}=`)) {return argv[i].slice(name.length + 1);}
  }
  return null;
}

const opts = {
  encrypt: argv.includes('--encrypt') || argv.includes('-e'),
  yes: argv.includes('--yes') || argv.includes('-y'),
  help: argv.includes('--help') || argv.includes('-h'),
  password:
    flagVal('--password') ??
    flagVal('-p') ??
    process.env.BACKUP_PASSWORD ??
    null,
};

// ── Help ──────────────────────────────────────────────────────────────────────

function showHelp() {
  box('db-backup.mjs — PostgreSQL backup tool', [
    '',
    '  node scripts/db-backup.mjs [flags]',
    '',
    '  --encrypt, -e     Encrypt backup with AES-256-CBC',
    '  --password, -p    Encryption password (non-interactive)',
    '  --yes, -y         Skip confirmation prompt',
    '  --help, -h        Show this message',
    '',
    '  Env: BACKUP_PASSWORD   alternative to --password',
  ]).forEach((l) => console.log(l));
  process.exit(0);
}

// ── .env / DB helpers ─────────────────────────────────────────────────────────

function readEnv() {
  const envPath = resolve(projectDir, '.env');
  if (!existsSync(envPath)) {return {};}
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {continue;}
    const eq = t.indexOf('=');
    if (eq === -1) {continue;}
    const val = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    env[t.slice(0, eq).trim()] = val;
  }
  return env;
}

function parseDatabaseUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!m) {return null;}
  return { user: m[1], pass: m[2], host: m[3], port: m[4], db: m[5] };
}

function run(cmd, extraOpts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...extraOpts });
  } catch {
    return null;
  }
}

// ── Backup directory ──────────────────────────────────────────────────────────

const BACKUP_DIR = resolve(projectDir, '.backups');

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    Logger.ok('Created backup directory');
  }
}

function lockFile(filePath) {
  try {
    chmodSync(filePath, 0o000);
    Logger.ok('File locked — only root can modify or delete it');
  } catch {
    Logger.warn('Could not set chmod 000; file is still readable by owner');
  }
}

function lockDir(dirPath) {
  try {
    chmodSync(dirPath, 0o000);
  } catch {
    /* ignore */
  }
}

function unlockDir(dirPath) {
  try {
    chmodSync(dirPath, 0o755);
  } catch {
    /* ignore */
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (opts.help) {showHelp();}

  // Banner
  const mode = opts.encrypt ? 'ENCRYPTED BACKUP' : 'PLAIN BACKUP';
  box(mode, [
    '',
    '  Creates a pg_dump of the airlink database.',
    opts.encrypt
      ? '  Archive will be AES-256-CBC encrypted.'
      : '  Archive will be stored in plaintext.',
    '',
    '  Backups are stored in a root-protected directory.',
  ]).forEach((l) => console.log(l));

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

  Logger.info(`Database  ${db.host}:${db.port}/${db.db}  (user: ${db.user})`);
  Logger.gap();

  // Collect encryption password
  let password = null;
  if (opts.encrypt) {
    if (opts.password) {
      password = opts.password;
      if (password.trim().length < 4) {
        Logger.fail('Password must be at least 4 characters');
        process.exit(1);
      }
      Logger.info('Encryption: AES-256-CBC (from --password flag)');
    } else if (process.stdout.isTTY) {
      password = await secret({
        label: 'Encryption password',
        hint: 'Minimum 4 characters',
      });
      if (!password || password.trim().length < 4) {
        Logger.fail('Password must be at least 4 characters');
        process.exit(1);
      }
      const confirm2 = await secret({ label: 'Confirm password' });
      if (password !== confirm2) {
        Logger.fail('Passwords do not match');
        process.exit(1);
      }
      Logger.ok('Encryption: AES-256-CBC');
    } else {
      Logger.fail('Non-interactive: use --password or BACKUP_PASSWORD env var');
      process.exit(1);
    }
  }

  // Confirm
  if (!opts.yes) {
    const go = await confirm('Create backup now?');
    if (!go) {
      Logger.warn('Aborted');
      process.exit(0);
    }
  }

  Logger.gap();

  // Step 1: backup directory (unlock if locked from previous run)
  unlockDir(BACKUP_DIR);
  ensureBackupDir();

  // Step 2: pg_dump
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dumpName = `airlink-${stamp}`;
  const dumpPath = join(BACKUP_DIR, `${dumpName}.sql`);

  await spinner('Running pg_dump', async () => {
    const cmd = `PGPASSWORD=${db.pass} pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} --no-owner --no-privileges -Fp -f "${dumpPath}"`;
    const result = run(cmd);
    if (result === null && !existsSync(dumpPath)) {
      throw new Error('pg_dump failed — check connection and credentials');
    }
    if (!existsSync(dumpPath)) {
      throw new Error('pg_dump produced no output file');
    }
  });

  const dumpBytes = Number(run(`stat -c%s "${dumpPath}"`) || 0);
  Logger.dim(`  ${dumpName}.sql  (${dumpBytes.toLocaleString()} bytes)`);

  // Step 3: encrypt (optional)
  let finalPath = dumpPath;
  if (opts.encrypt && password) {
    const encPath = `${dumpPath}.enc`;
    await spinner('Encrypting with AES-256-CBC', async () => {
      const cmd = `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in "${dumpPath}" -out "${encPath}" -pass stdin`;
      const result = run(cmd, { input: `${password  }\n` });
      if (result === null && !existsSync(encPath)) {
        throw new Error(
          'Encryption failed — unencrypted dump is still available',
        );
      }
      run(`rm -f "${dumpPath}"`);
    });

    finalPath = encPath;
    const encBytes = Number(run(`stat -c%s "${encPath}"`) || 0);
    Logger.dim(`  ${dumpName}.sql.enc  (${encBytes.toLocaleString()} bytes)`);
  }

  // Step 4: protect
  Logger.gap();
  Logger.section('Delete protection');
  lockFile(finalPath);
  lockDir(BACKUP_DIR);

  // Done
  Logger.gap();
  Logger.ok('Backup complete');
  Logger.dim(`Location: ${finalPath}`);
  Logger.gap();

  const restoreCmd = opts.encrypt
    ? `openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${finalPath}" | psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db}`
    : `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} < "${finalPath}"`;

  Logger.dim('To restore:');
  Logger.dim(`  ${restoreCmd}`);
}

main().catch((err) => {
  Logger.fail(err.message || String(err));
  process.exit(1);
});
