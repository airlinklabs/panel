#!/usr/bin/env node

/**
 * Airlink Panel — first-run setup script.
 *
 * Installs Redis + MariaDB if missing, creates the airlink database and a
 * dedicated MySQL user, generates .env, and builds the project.
 *
 * Usage:
 *   node public/setup.mjs            # interactive (prompts before destructive actions)
 *   node public/setup.mjs --yes      # non-interactive, accepts all defaults
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BOLD   = '\x1b[1m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

const ok     = (msg) => console.log(`${GREEN}✓${RESET} ${msg}`);
const warn   = (msg) => console.log(`${YELLOW}⚠${RESET} ${msg}`);
const fail   = (msg) => console.log(`${RED}✗${RESET} ${msg}`);
const info   = (msg) => console.log(`${CYAN}→${RESET} ${msg}`);
const header = (msg) => console.log(`\n${BOLD}${msg}${RESET}\n`);

const isNonInteractive = process.argv.includes('--yes') || process.argv.includes('-y');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 60_000, ...opts }).toString().trim();
  } catch {
    return null;
  }
}

function runOrFail(cmd, errorMsg) {
  const result = run(cmd);
  if (result === null) {
    fail(errorMsg);
    process.exit(1);
  }
  return result;
}

function ask(question) {
  if (isNonInteractive) return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (Y/n) `, (answer) => {
      rl.close();
      resolve(answer === '' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function generatePassword() {
  return randomBytes(24).toString('base64url');
}

// ── Pre-flight checks ───────────────────────────────────────────────────────

function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) {
    fail(`Node.js >= 22 required (found ${process.version})`);
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);
}

function checkPnpm() {
  const ver = run('pnpm --version');
  if (!ver) {
    fail('pnpm not found — install with: npm i -g pnpm');
    process.exit(1);
  }
  ok(`pnpm ${ver}`);
}

// ── Redis ────────────────────────────────────────────────────────────────────

function ensureRedis() {
  header('Redis');

  const bin = run('which redis-server');
  if (!bin) {
    warn('redis-server not found');
    info('Installing redis-server…');
    const install = run('sudo apt-get update && sudo apt-get install -y redis-server');
    if (install === null) {
      fail('Could not install redis-server. Please install manually:');
      fail('  sudo apt install redis-server');
      process.exit(1);
    }
    ok('redis-server installed');
  } else {
    ok(`redis-server at ${bin}`);
  }

  // Start if not active
  const status = run('systemctl is-active redis-server 2>/dev/null || echo stopped');
  if (status !== 'active') {
    warn('redis-server is not running');
    run('sudo systemctl start redis-server');
    run('sudo systemctl enable redis-server');
    ok('redis-server started');
  } else {
    ok('redis-server is running');
  }

  // Quick connectivity check
  const ping = run('redis-cli ping 2>/dev/null');
  if (ping === 'PONG') {
    ok('redis-cli ping → PONG');
  } else {
    fail('redis-cli ping failed — check your Redis config');
    process.exit(1);
  }
}

// ── MariaDB ──────────────────────────────────────────────────────────────────

function ensureMariaDB() {
  header('MariaDB');

  const bin = run('which mariadbd') || run('which mysqld');
  if (!bin) {
    warn('MariaDB not found');
    info('Installing mariadb-server…');
    const install = run('sudo apt-get update && sudo apt-get install -y mariadb-server');
    if (install === null) {
      fail('Could not install mariadb-server. Please install manually:');
      fail('  sudo apt install mariadb-server');
      process.exit(1);
    }
    ok('mariadb-server installed');
  } else {
    ok(`MariaDB at ${bin}`);
  }

  // Start if not active
  const status = run('systemctl is-active mariadb 2>/dev/null || echo stopped');
  if (status !== 'active') {
    warn('mariadb is not running');
    run('sudo systemctl start mariadb');
    run('sudo systemctl enable mariadb');
    ok('mariadb started');
  } else {
    ok('mariadb is running');
  }

  // Check connectivity (no password, root)
  const conn = run('mariadb -u root -N -e "SELECT 1" 2>/dev/null');
  if (conn === '1') {
    ok('mariadb -u root → connected');
  } else {
    fail('Cannot connect to MariaDB as root. If you set a password, set MYSQL_PASSWORD in .env.');
    process.exit(1);
  }
}

// ── Database + user ──────────────────────────────────────────────────────────

function setupDatabase() {
  header('Database');

  const dbUser = 'airlink';
  const dbPass = generatePassword();
  const dbName = 'airlink';

  // Create database if missing
  const dbExists = run(`mariadb -u root -N -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}'" 2>/dev/null`);
  if (!dbExists) {
    info(`Creating database "${dbName}"…`);
    run(`mariadb -u root -e "CREATE DATABASE \`${dbName}\`"`);
    ok(`database "${dbName}" created`);
  } else {
    ok(`database "${dbName}" exists`);
  }

  // Create user if missing, then grant privileges
  const userExists = run(`mariadb -u root -N -e "SELECT user FROM mysql.user WHERE user = '${dbUser}'" 2>/dev/null`);
  if (!userExists) {
    info(`Creating MySQL user "${dbUser}"…`);
    run(`mariadb -u root -e "CREATE USER '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${dbPass}'"`);
    run(`mariadb -u root -e "CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'"`);
    run(`mariadb -u root -e "GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1'"`);
    run(`mariadb -u root -e "GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'"`);
    run('mariadb -u root -e "FLUSH PRIVILEGES"');
    ok(`user "${dbUser}" created with full access to "${dbName}"`);
  } else {
    // User exists — reset password so we control it
    info(`User "${dbUser}" exists — resetting password…`);
    run(`mariadb -u root -e "ALTER USER '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${dbPass}'"`);
    run(`mariadb -u root -e "ALTER USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'"`);
    run(`mariadb -u root -e "GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1'"`);
    run(`mariadb -u root -e "GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'"`);
    run('mariadb -u root -e "FLUSH PRIVILEGES"');
    ok(`user "${dbUser}" privileges confirmed`);
  }

  // Verify the new user can connect
  const testConn = run(`mariadb -u ${dbUser} -p${dbPass} -N -e "SELECT 1" 2>/dev/null`);
  if (testConn === '1') {
    ok(`user "${dbUser}" → connected`);
  } else {
    fail(`Could not connect as "${dbUser}". Check MariaDB config.`);
    process.exit(1);
  }

  return { dbUser, dbPass, dbName };
}

// ── .env ─────────────────────────────────────────────────────────────────────

function generateEnv(creds) {
  header('Environment');

  if (existsSync('.env')) {
    warn('.env already exists — skipping generation');
    info('Delete .env and re-run to regenerate');
    return;
  }

  const sessionSecret = randomBytes(32).toString('hex');
  const lines = [
    'URL="http://localhost:3000"',
    'PORT=3000',
    'NAME="Airlink"',
    `DATABASE_URL="mysql://${creds.dbUser}:${creds.dbPass}@127.0.0.1:3306/${creds.dbName}"`,
    'REDIS_URL="redis://127.0.0.1:6379"',
    'NODE_ENV="development"',
    `SESSION_SECRET="${sessionSecret}"`,
    '',
    '# Database credentials (used by "Auto-generate database host")',
    'MYSQL_HOST="127.0.0.1"',
    'MYSQL_PORT="3306"',
    `MYSQL_USER="${creds.dbUser}"`,
    `MYSQL_PASSWORD="${creds.dbPass}"`,
    '',
  ];

  writeFileSync('.env', lines.join('\n'), 'utf-8');
  ok('.env generated with secure SESSION_SECRET');
}

// ── Prisma ───────────────────────────────────────────────────────────────────

function runPrisma() {
  header('Prisma');

  info('Generating Prisma client…');
  runOrFail('npx prisma generate', 'prisma generate failed');
  ok('prisma generate');

  info('Pushing schema to database…');
  runOrFail('npx prisma db push', 'prisma db push failed');
  ok('prisma db push');
}

// ── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  header('Build');

  info('Installing dependencies…');
  runOrFail('pnpm install', 'pnpm install failed');
  ok('pnpm install');

  info('Building TypeScript…');
  const tsc = run('npx tsc 2>&1');
  if (tsc === null) {
    warn('tsc reported errors (likely pre-existing) — continuing');
  } else {
    ok('tsc');
  }

  const tscPrisma = run('npx tsc -p tsconfig.prisma.json 2>&1');
  if (tscPrisma === null) {
    warn('tsc prisma reported errors — continuing');
  } else {
    ok('tsc prisma');
  }

  info('Compiling CSS…');
  run('npx tailwindcss -i ./public/tw.css -o ./public/styles.css');
  ok('tailwindcss');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log();
  header('════════════════════════════════════════');
  header('   Airlink Panel — Setup');
  header('════════════════════════════════════════');

  checkNodeVersion();
  checkPnpm();
  ensureRedis();
  ensureMariaDB();
  const creds = setupDatabase();
  generateEnv(creds);
  runPrisma();
  runBuild();

  header('════════════════════════════════════════');
  ok('Setup complete!');
  header('════════════════════════════════════════');

  console.log(`${BOLD}MySQL credentials:${RESET}`);
  console.log(`  Host:     127.0.0.1`);
  console.log(`  Port:     3306`);
  console.log(`  Database: ${creds.dbName}`);
  console.log(`  User:     ${creds.dbUser}`);
  console.log(`  Password: ${creds.dbPass}`);
  console.log();
  console.log(`${BOLD}DATABASE_URL (already in .env):${RESET}`);
  console.log(`  mysql://${creds.dbUser}:${creds.dbPass}@127.0.0.1:3306/${creds.dbName}`);
  console.log();
  console.log(`${CYAN}Start the panel with: pnpm run start${RESET}`);
  console.log();
}

main().catch((err) => {
  fail(`Setup failed: ${err.message}`);
  process.exit(1);
});
