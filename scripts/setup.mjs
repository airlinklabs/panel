#!/usr/bin/env node
/**
 * setup.mjs — First-run installer for the Airlink panel.
 *
 * What it does:
 *   1. Reads project metadata from package.json.
 *   2. Checks Node.js version and package manager availability.
 *   3. Installs Redis and PostgreSQL if missing (apt, dnf, pacman, brew, etc).
 *   4. Starts both services and verifies connectivity.
 *   5. Creates the application database and a dedicated DB user.
 *   6. Writes a .env file with secure random secrets.
 *   7. Runs prisma generate + db push, then compiles TypeScript and CSS.
 *
 * Flags:
 *   --yes / -y             Skip confirmation prompts (CI mode).
 *   --skip-services        Skip Redis + PostgreSQL install/start.
 *   --skip-build           Skip pnpm install + tsc + tailwind.
 *   --db-host HOST         Override PostgreSQL host    [default: 127.0.0.1]
 *   --db-port PORT         Override PostgreSQL port    [default: 5432]
 *   --db-name NAME         Override database name      [default: airlink]
 *   --db-user USER         Override DB username        [default: airlink]
 *   --redis-url URL        Override Redis URL          [default: redis://127.0.0.1:6379]
 *   --url URL              Panel public URL            [default: http://localhost:3000]
 *   --asset-url URL        CDN/asset origin (ASSET_URL).
 *   --asset-base-url URL   Base URL for static assets (ASSET_BASE_URL).
 *   --trust-proxy          Enable X-Forwarded-* header trust.
 *   --cookie-domain DOM    Cookie domain for cross-subdomain sessions.
 *   --csp-enabled          Force Content Security Policy on.
 *   --rate-limit MAX       Global rate limit per IP    [default: 500]
 *   --log-level LEVEL      Log level                   [default: info]
 *   --smtp-host HOST       SMTP server host.
 *   --smtp-port PORT       SMTP server port            [default: 587]
 *   --smtp-user USER       SMTP username.
 *   --smtp-pass PASS       SMTP password.
 *   --help / -h            Show this message.
 */

import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { Logger, box, prompt, confirm, spinner } from './ui.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, '..');

// ── Platform ──────────────────────────────────────────────────────────────────

const PLATFORM = process.platform;
const ARCH = process.arch;
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

// ── Package metadata ──────────────────────────────────────────────────────────

function loadPackageMeta() {
  for (const p of [
    resolve(projectDir, 'package.json'),
    resolve(__dirname, 'package.json'),
  ]) {
    if (!existsSync(p)) {continue;}
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      return {
        name: raw.name ?? 'Panel',
        version: raw.version ?? '0.0.0',
        engines: raw.engines ?? {},
      };
    } catch {
      /* try next */
    }
  }
  return { name: 'Panel', version: '0.0.0', engines: {} };
}

const PKG = loadPackageMeta();

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1] && !argv[i + 1].startsWith('-'))
    {return argv[i + 1];}
    if (argv[i].startsWith(`${name}=`)) {return argv[i].slice(name.length + 1);}
  }
  return fallback;
}

const opts = {
  yes: argv.includes('--yes') || argv.includes('-y'),
  help: argv.includes('--help') || argv.includes('-h'),
  skipServices: argv.includes('--skip-services'),
  skipBuild: argv.includes('--skip-build'),
  dbHost: flag('--db-host', '127.0.0.1'),
  dbPort: flag('--db-port', '5432'),
  dbName: flag('--db-name', 'airlink'),
  dbUser: flag('--db-user', 'airlink'),
  redisUrl: flag('--redis-url', null),
  url: flag('--url', 'http://localhost:3000'),
  assetUrl: flag('--asset-url', ''),
  assetBaseUrl: flag('--asset-base-url', ''),
  trustProxy: argv.includes('--trust-proxy'),
  cookieDomain: flag('--cookie-domain', ''),
  cspEnabled: argv.includes('--csp-enabled'),
  rateLimit: flag('--rate-limit', '500'),
  logLevel: flag('--log-level', 'info'),
  smtpHost: flag('--smtp-host', ''),
  smtpPort: flag('--smtp-port', '587'),
  smtpUser: flag('--smtp-user', ''),
  smtpPass: flag('--smtp-pass', ''),
};

// ── Help ──────────────────────────────────────────────────────────────────────

function showHelp() {
  box(`${PKG.name} v${PKG.version} — First-run setup`, [
    '',
    '  node scripts/setup.mjs [flags]',
    '',
    '  --yes, -y              Accept all prompts (CI mode)',
    '  --skip-services        Skip Redis / PostgreSQL install',
    '  --skip-build           Skip pnpm install + tsc + tailwind',
    '  --db-host HOST         PostgreSQL host     [127.0.0.1]',
    '  --db-port PORT         PostgreSQL port     [5432]',
    '  --db-name NAME         Database name       [airlink]',
    '  --db-user USER         Database username   [airlink]',
    '  --redis-url URL        Redis URL           [redis://127.0.0.1:6379]',
    '  --url URL              Panel public URL    [http://localhost:3000]',
    '  --trust-proxy          Trust X-Forwarded-* headers',
    '  --cookie-domain DOM    Cookie domain',
    '  --csp-enabled          Force CSP on',
    '  --rate-limit MAX       Rate limit per IP   [500]',
    '  --log-level LEVEL      Log level           [info]',
    '  --smtp-host HOST       SMTP host',
    '  --smtp-port PORT       SMTP port           [587]',
    '  --smtp-user USER       SMTP username',
    '  --smtp-pass PASS       SMTP password',
    '  --help, -h             Show this message',
  ]).forEach((l) => console.log(l));
  process.exit(0);
}

// ── Shell helpers ─────────────────────────────────────────────────────────────

function run(cmd, extraOpts = {}) {
  try {
    const out = execSync(cmd, {
      stdio: 'pipe',
      timeout: 120_000,
      cwd: projectDir,
      ...extraOpts,
    });
    return out?.toString().trim() ?? '';
  } catch {
    return null;
  }
}

function runFile(file, args) {
  try {
    return (
      execFileSync(file, args, {
        stdio: 'pipe',
        timeout: 120_000,
        cwd: projectDir,
      })
        ?.toString()
        .trim() ?? ''
    );
  } catch {
    return null;
  }
}

function runLive(cmd, label) {
  Logger.info(label);
  const result = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: projectDir,
    timeout: 300_000,
  });
  if (result.status !== 0) {
    Logger.fail(`${label} — exited with code ${result.status ?? 'unknown'}`);
    process.exit(1);
  }
}

function which(bin) {
  return run(IS_WIN ? `where ${bin}` : `which ${bin}`);
}

function waitFor(check, attempts = 15) {
  return new Promise((resolve) => {
    const retry = (remaining) => {
      if (check()) {return resolve(true);}
      if (remaining <= 0) {return resolve(false);}
      setTimeout(() => retry(remaining - 1), 1_000);
    };
    retry(attempts);
  });
}

// ── OS / package manager detection ───────────────────────────────────────────

function detectLinuxPkgMgr() {
  for (const m of ['apt-get', 'dnf', 'yum', 'pacman', 'zypper', 'apk'])
  {if (which(m)) {return m;}}
  return null;
}

function buildInstallCmd(pkgMgr, map) {
  const pkg = map[pkgMgr];
  if (!pkg) {return null;}
  switch (pkgMgr) {
  case 'apt-get':
    return `sudo apt-get update -qq && sudo apt-get install -y ${pkg}`;
  case 'dnf':
    return `sudo dnf install -y ${pkg}`;
  case 'yum':
    return `sudo yum install -y ${pkg}`;
  case 'pacman':
    return `sudo pacman -Sy --noconfirm ${pkg}`;
  case 'zypper':
    return `sudo zypper install -y ${pkg}`;
  case 'apk':
    return `sudo apk add --no-cache ${pkg}`;
  case 'brew':
    return `brew install ${pkg}`;
  case 'winget':
    return `winget install --silent --accept-package-agreements --accept-source-agreements ${pkg}`;
  case 'choco':
    return `choco install ${pkg} -y`;
  case 'scoop':
    return `scoop install ${pkg}`;
  default:
    return null;
  }
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

const genPassword = () => randomBytes(32).toString('base64url');
const genSecret = () => randomBytes(32).toString('hex');

// ── .env helpers ──────────────────────────────────────────────────────────────

function readEnvFile() {
  const envPath = resolve(projectDir, '.env');
  if (!existsSync(envPath)) {return {};}
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((l) =>
        l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"']*)["']?\s*$/i),
      )
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

const isTemplateEnv = (env) => env.SESSION_SECRET === 'change_me';

function assertSqlIdentifier(val, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(val))
  {throw new Error(
    `${label} may only contain letters, numbers, and underscores.`,
  );}
}

// ── Service helpers ───────────────────────────────────────────────────────────

function serviceIsActive(name) {
  if (IS_WIN) {return !!run(`sc query "${name}" 2>nul`)?.includes('RUNNING');}
  if (IS_MAC) {return !!run(`launchctl list 2>/dev/null | grep "${name}"`);}
  if (run(`systemctl is-active "${name}" 2>/dev/null`) === 'active')
  {return true;}
  return (
    run(`service "${name}" status 2>/dev/null; echo $?`, { timeout: 5_000 })
      ?.split('\n')
      .pop() === '0'
  );
}

function startService(name, binaryFallback = null) {
  if (serviceIsActive(name)) {return true;}
  if (IS_MAC) {run(`brew services start "${name}" 2>/dev/null`);}
  else if (IS_LINUX) {
    if (existsSync('/run/systemd/system'))
    {run(`sudo systemctl start "${name}" 2>/dev/null`, { timeout: 15_000 });}
    else {run(`sudo service "${name}" start 2>/dev/null`, { timeout: 5_000 });}
    if (!serviceIsActive(name) && binaryFallback) {run(binaryFallback);}
  }
  return serviceIsActive(name);
}

function enableService(name) {
  if (IS_MAC) {run(`brew services restart "${name}" 2>/dev/null`);}
  else {run(`sudo systemctl enable "${name}" 2>/dev/null || true`);}
}

// ── Node / pnpm check ────────────────────────────────────────────────────────

let PKG_MGR = 'npm';

function checkNode() {
  Logger.section('Pre-flight');
  const minMajor = parseInt(PKG.engines?.node?.replace(/\D/g, '') || '22', 10);
  const curMajor = parseInt(process.versions.node, 10);
  if (curMajor < minMajor) {
    Logger.fail(`Node.js ${minMajor}+ required — you have ${process.version}.`);
    Logger.info('Download the latest LTS: https://nodejs.org');
    process.exit(1);
  }
  Logger.ok(`Node.js ${process.version} (>= ${minMajor} required)`);
}

function checkPkgMgr() {
  const pnpmVer = run('pnpm --version');
  if (pnpmVer) {
    PKG_MGR = 'pnpm';
    Logger.ok(`pnpm ${pnpmVer}`);
    return;
  }

  Logger.warn('pnpm not found — installing via npm...');
  run('npm install -g pnpm', { stdio: 'inherit' });
  if (which('pnpm')) {
    PKG_MGR = 'pnpm';
    Logger.ok(`pnpm ${run('pnpm --version')} (just installed)`);
    return;
  }

  Logger.warn('Could not install pnpm — falling back to npm');
  PKG_MGR = 'npm';
  Logger.ok(`npm ${run('npm --version')}`);
}

// ── Redis ─────────────────────────────────────────────────────────────────────

async function ensureRedis() {
  Logger.section('Redis');

  const redisBin = which('redis-server') || which('redis-server.exe');
  if (!redisBin) {
    Logger.warn('redis-server not found on PATH');
    if (!opts.yes) {
      const go = await confirm('Install Redis automatically?');
      if (!go) {
        Logger.fail('Redis is required. Install it manually.');
        process.exit(1);
      }
    }

    const mgr = IS_MAC
      ? which('brew')
        ? 'brew'
        : null
      : IS_LINUX
        ? detectLinuxPkgMgr()
        : null;
    const cmd = mgr
      ? buildInstallCmd(mgr, {
        'apt-get': 'redis-server',
        dnf: 'redis',
        yum: 'redis',
        pacman: 'redis',
        zypper: 'redis',
        apk: 'redis',
        brew: 'redis',
      })
      : null;
    if (!cmd) {
      Logger.fail('Cannot determine how to install Redis.');
      process.exit(1);
    }

    await spinner('Installing Redis', async () => {
      if (run(cmd) === null) {throw new Error('Redis install failed');}
    });
    Logger.ok('Redis installed');
  } else {
    Logger.ok(`redis-server found at ${redisBin}`);
  }

  const svcName = IS_WIN ? 'Redis' : IS_MAC ? 'redis' : 'redis-server';
  const redisCli = which('redis-cli') || 'redis-cli';
  const redisReady = () => run(`${redisCli} ping 2>/dev/null`) === 'PONG';

  if (!redisReady() && !serviceIsActive(svcName)) {
    Logger.warn(`Redis service '${svcName}' is not running`);
    const fallback = IS_WIN ? null : 'redis-server --daemonize yes 2>/dev/null';
    await spinner('Starting Redis', async () => {
      if (!startService(svcName, fallback))
      {throw new Error('Could not start Redis');}
    });
    enableService(svcName);
    Logger.ok('Redis started and enabled');
  } else {
    Logger.ok('Redis is running');
  }

  if (!(await waitFor(redisReady))) {
    Logger.fail('redis-cli ping did not return PONG');
    process.exit(1);
  }
  Logger.ok('Redis PONG ✓');
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

async function ensurePostgres() {
  Logger.section('PostgreSQL');

  const pgBin = which('psql') || which('psql.exe');
  if (!pgBin) {
    Logger.warn('psql not found on PATH');
    if (!opts.yes) {
      const go = await confirm('Install PostgreSQL automatically?');
      if (!go) {
        Logger.fail('PostgreSQL is required. Install it manually.');
        process.exit(1);
      }
    }

    const mgr = IS_MAC
      ? which('brew')
        ? 'brew'
        : null
      : IS_LINUX
        ? detectLinuxPkgMgr()
        : null;
    const cmd = mgr
      ? buildInstallCmd(mgr, {
        'apt-get': 'postgresql postgresql-contrib',
        dnf: 'postgresql-server postgresql',
        yum: 'postgresql-server postgresql',
        pacman: 'postgresql',
        zypper: 'postgresql-server postgresql',
        apk: 'postgresql postgresql-contrib',
        brew: 'postgresql@16',
      })
      : null;
    if (!cmd) {
      Logger.fail('Cannot determine how to install PostgreSQL.');
      process.exit(1);
    }

    await spinner('Installing PostgreSQL', async () => {
      if (run(cmd) === null) {throw new Error('PostgreSQL install failed');}
    });
    Logger.ok('PostgreSQL installed');
  } else {
    Logger.ok(`psql found at ${pgBin}`);
  }

  const svcName = IS_WIN
    ? 'postgresql-x64-16'
    : IS_MAC
      ? 'postgresql'
      : 'postgresql';
  const pgReady = () => {
    const r = run('sudo -u postgres psql -t -c "SELECT 1" 2>/dev/null', {
      timeout: 5_000,
    });
    return r?.trim() === '1';
  };

  if (!pgReady()) {
    Logger.warn(`PostgreSQL service '${svcName}' is not responding`);
    await spinner('Starting PostgreSQL', async () => {
      if (!startService(svcName)) {throw new Error('Could not start PostgreSQL');}
    });
    enableService(svcName);
    Logger.ok('PostgreSQL started and enabled');
  } else {
    Logger.ok('PostgreSQL is running');
  }

  if (!(await waitFor(pgReady))) {
    Logger.fail('Cannot connect to PostgreSQL as postgres user');
    Logger.warn('Check your PostgreSQL authentication config (pg_hba.conf).');
    process.exit(1);
  }
  Logger.ok('PostgreSQL connection OK');
}

// ── psql helper ───────────────────────────────────────────────────────────────

function psql(stmt) {
  const args = ['-U', 'postgres', '-t', '-A', '-c', stmt];
  return (
    runFile('sudo', ['-u', 'postgres', 'psql', ...args]) ??
    runFile('psql', ['-U', 'postgres', ...args]) ??
    runFile('psql', args)
  );
}

// ── Database setup ────────────────────────────────────────────────────────────

async function setupDatabase() {
  Logger.section('Database');

  const existingEnv = readEnvFile();
  const loadedUrl = !isTemplateEnv(existingEnv) && existingEnv.DATABASE_URL;
  let parsed;
  try {
    parsed = loadedUrl ? new URL(loadedUrl) : null;
  } catch {
    parsed = null;
  }

  const dbHost = parsed?.hostname ?? opts.dbHost;
  const dbPort = parsed?.port ?? opts.dbPort;
  const dbName = parsed?.pathname?.slice(1) || opts.dbName;
  const dbUser = parsed?.username ?? opts.dbUser;
  const dbPass = existingEnv.PGPASSWORD ?? parsed?.password ?? genPassword();

  assertSqlIdentifier(dbName, 'Database name');
  assertSqlIdentifier(dbUser, 'Database user');

  // Allow interactive override when not in CI mode
  let finalHost = dbHost,
    finalPort = dbPort,
    finalName = dbName,
    finalUser = dbUser;
  if (!opts.yes && !loadedUrl) {
    Logger.info('Press Enter to accept defaults');
    finalHost = await prompt({ label: 'PostgreSQL host', default: dbHost });
    finalPort = await prompt({ label: 'PostgreSQL port', default: dbPort });
    finalName = await prompt({ label: 'Database name', default: dbName });
    finalUser = await prompt({ label: 'Database username', default: dbUser });
  }

  // Create database if missing
  const dbExists = psql(
    `SELECT 1 FROM pg_database WHERE datname = '${finalName}'`,
  );
  if (!dbExists?.trim()) {
    await spinner(`Creating database '${finalName}'`, async () => {
      if (psql(`CREATE DATABASE "${finalName}"`) === null)
      {throw new Error(`Could not create database '${finalName}'`);}
    });
  } else {
    Logger.ok(`Database '${finalName}' already exists`);
  }

  // Create / refresh role
  const roleExists = psql(
    `SELECT 1 FROM pg_roles WHERE rolname = '${finalUser}'`,
  );
  if (!roleExists?.trim()) {
    await spinner(`Creating role '${finalUser}'`, async () => {
      psql(`CREATE ROLE "${finalUser}" WITH LOGIN PASSWORD '${dbPass}'`);
    });
  } else {
    await spinner(`Refreshing password for role '${finalUser}'`, async () => {
      psql(`ALTER ROLE "${finalUser}" WITH PASSWORD '${dbPass}'`);
    });
  }

  // Grant privileges
  await spinner('Granting privileges', async () => {
    psql(`GRANT ALL PRIVILEGES ON DATABASE "${finalName}" TO "${finalUser}"`);
    psql(`GRANT ALL ON SCHEMA public TO "${finalUser}"`);
    psql(`GRANT CREATE ON SCHEMA public TO "${finalUser}"`);
    psql(`GRANT ALL ON ALL TABLES    IN SCHEMA public TO "${finalUser}"`);
    psql(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${finalUser}"`);
    psql(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO "${finalUser}"`,
    );
    psql(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${finalUser}"`,
    );
  });

  // Verify connection
  const testCmd = `psql -U ${finalUser} -h ${finalHost} -p ${finalPort} -d ${finalName} -t -A -c "SELECT 1" 2>/dev/null`;
  const ok = run(`PGPASSWORD=${dbPass} ${testCmd}`);
  if (ok?.trim() !== '1') {
    Logger.fail(`Cannot connect as '${finalUser}' — check pg_hba.conf`);
    process.exit(1);
  }
  Logger.ok(`Connection as '${finalUser}' verified`);

  return {
    dbHost: finalHost,
    dbPort: finalPort,
    dbName: finalName,
    dbUser: finalUser,
    dbPass,
  };
}

// ── .env generation ───────────────────────────────────────────────────────────

async function generateEnv(creds) {
  Logger.section('Environment file');

  const envPath = resolve(projectDir, '.env');
  const existingEnv = readEnvFile();

  if (existsSync(envPath) && !isTemplateEnv(existingEnv)) {
    Logger.warn('.env already exists — leaving it untouched');
    Logger.dim('Delete it and re-run to regenerate with fresh secrets');
    return;
  }

  let panelUrl = opts.url;
  let assetUrl = opts.assetUrl;
  let assetBaseUrl = opts.assetBaseUrl;

  if (!opts.yes) {
    Logger.info('Panel configuration — press Enter to accept defaults');
    panelUrl = await prompt({ label: 'Panel public URL', default: panelUrl });
    assetUrl = await prompt({
      label: 'Asset CDN URL (empty for local)',
      default: assetUrl,
    });
    assetBaseUrl = await prompt({
      label: 'Asset base URL (empty for local)',
      default: assetBaseUrl,
    });
  }

  const { dbHost, dbPort, dbName, dbUser, dbPass } = creds;
  const redisUrl = opts.redisUrl ?? 'redis://127.0.0.1:6379';
  const sessionSecret = genSecret();

  const lines = [
    '#',
    `# ${PKG.name} — environment configuration`,
    `# Generated by setup.mjs on ${new Date().toISOString()}`,
    '#',
    '',
    '# ── Core ────────────────────────────────────────────────────────────────────',
    `URL="${panelUrl}"`,
    'PORT=3000',
    `NAME="${PKG.name}"`,
    'NODE_ENV="development"',
    '',
    '# ── Session ──────────────────────────────────────────────────────────────────',
    `SESSION_SECRET="${sessionSecret}"`,
    '# SESSION_MAX_AGE_MS=604800000',
    '',
    '# ── Reverse Proxy / HTTPS ────────────────────────────────────────────────────',
    `TRUST_PROXY="${opts.trustProxy ? 'true' : ''}"`,
    `COOKIE_DOMAIN="${opts.cookieDomain}"`,
    '',
    '# ── Asset Delivery ───────────────────────────────────────────────────────────',
    `ASSET_URL="${assetUrl}"`,
    `ASSET_BASE_URL="${assetBaseUrl}"`,
    '',
    '# ── Content Security Policy ──────────────────────────────────────────────────',
    `CSP_ENABLED="${opts.cspEnabled ? 'true' : ''}"`,
    '',
    '# ── Rate Limiting ────────────────────────────────────────────────────────────',
    `RATE_LIMIT_MAX=${opts.rateLimit}`,
    '# RATE_LIMIT_WINDOW_MS=60000',
    '',
    '# ── Logging ──────────────────────────────────────────────────────────────────',
    `LOG_LEVEL="${opts.logLevel}"`,
    '',
    '# ── Storage ──────────────────────────────────────────────────────────────────',
    '# STORAGE_DIR=""',
    '',
    '# ── Database (Prisma) ────────────────────────────────────────────────────────',
    `DATABASE_URL="postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}"`,
    'DB_POOL_MAX=20',
    '',
    '# ── Database (raw credentials) ───────────────────────────────────────────────',
    `PGHOST="${dbHost}"`,
    `PGPORT="${dbPort}"`,
    `PGUSER="${dbUser}"`,
    `PGPASSWORD="${dbPass}"`,
    '',
    '# ── Redis ────────────────────────────────────────────────────────────────────',
    `REDIS_URL="${redisUrl}"`,
    'ALLOWED_ORIGINS="0.0.0.0"',
    '',
    '# ── TLS (direct HTTPS without a reverse proxy) ───────────────────────────────',
    '# TLS_CERT_PATH=""',
    '# TLS_KEY_PATH=""',
    '',
    '# ── SMTP / Email ─────────────────────────────────────────────────────────────',
    `SMTP_HOST="${opts.smtpHost}"`,
    `SMTP_PORT=${opts.smtpPort}`,
    `SMTP_USER="${opts.smtpUser}"`,
    `SMTP_PASS="${opts.smtpPass}"`,
    '# SMTP_FROM="no-reply@example.com"',
    '# SMTP_SECURE="true"',
    '',
  ];

  writeFileSync(envPath, lines.join('\n'), 'utf-8');
  Logger.ok('.env written with a fresh SESSION_SECRET');
  if (assetUrl) {Logger.ok(`ASSET_URL set to ${assetUrl}`);}
  Logger.dim(`Path: ${envPath}`);
}

// ── Prisma ────────────────────────────────────────────────────────────────────

async function runPrisma() {
  Logger.section('Prisma');
  const exec = PKG_MGR === 'pnpm' ? 'pnpm exec' : 'npx';
  await spinner('prisma generate', async () =>
    runLive(`${exec} prisma generate`, 'prisma generate'),
  );
  await spinner('prisma db push', async () =>
    runLive(`${exec} prisma db push`, 'prisma db push'),
  );
}

// ── Build ─────────────────────────────────────────────────────────────────────

async function runBuild() {
  Logger.section('Build');
  const installCmd = PKG_MGR === 'pnpm' ? 'pnpm install' : 'npm install';
  const exec = PKG_MGR === 'pnpm' ? 'pnpm exec' : 'npx';

  await spinner('Installing dependencies', async () =>
    runLive(installCmd, 'install'),
  );

  await spinner('tsc (main)', async () => {
    const r = run(`${exec} tsc 2>&1`);
    if (r === null) {Logger.warn('tsc reported errors — check manually');}
  });

  await spinner('tsc (prisma config)', async () => {
    const r = run(`${exec} tsc -p tsconfig.prisma.json 2>&1`);
    if (r === null)
    {Logger.warn('tsc (prisma) reported errors — check manually');}
  });

  await spinner('CSS (Vite + Tailwind)', async () => {
    const r = run(`${exec} vite build 2>&1`);
    if (r === null)
    {Logger.warn('Vite build failed — run build:assets manually');}
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(creds) {
  Logger.gap();
  Logger.section('Setup complete');
  Logger.gap();

  const width = 52;
  const lines = [
    '  Database credentials',
    '',
    `  Host      ${creds.dbHost}`,
    `  Port      ${creds.dbPort}`,
    `  Database  ${creds.dbName}`,
    `  User      ${creds.dbUser}`,
    `  Password  ${creds.dbPass}`,
    '',
    '  DATABASE_URL',
    `  postgresql://${creds.dbUser}:${creds.dbPass}@${creds.dbHost}:${creds.dbPort}/${creds.dbName}`,
    '',
    '  Next steps',
    '',
    '    pnpm run start    — start the panel',
    '    pnpm run dev      — start in watch mode',
    '    .env              — configuration file',
  ];

  lines.forEach((l) => console.log(`  ${l}`));
  Logger.gap();
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (opts.help) {showHelp();}

  Logger.banner(`${PKG.name}`, PKG.version, `${PLATFORM} (${ARCH})`);
  Logger.dim(`  Node    : ${process.version}`);
  Logger.dim(`  Project : ${projectDir}`);

  checkNode();
  checkPkgMgr();

  if (opts.skipServices) {
    Logger.section('Services');
    Logger.warn('--skip-services: skipping Redis and PostgreSQL');
  } else {
    await ensureRedis();
    await ensurePostgres();
  }

  const creds = await setupDatabase();
  await generateEnv(creds);
  await runPrisma();

  if (opts.skipBuild) {
    Logger.section('Build');
    Logger.warn('--skip-build: skipping pnpm install and compilation');
  } else {
    await runBuild();
  }

  printSummary(creds);
}

main().catch((err) => {
  Logger.gap();
  Logger.fail(`Setup failed: ${err.message}`);
  if (process.env.DEBUG) {console.error(err.stack);}
  Logger.gap();
  process.exit(1);
});
