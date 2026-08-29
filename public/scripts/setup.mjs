#!/usr/bin/env node

/**
 * setup.mjs - first-run installer for the panel.
 *
 * What it does:
 *   1. Reads project metadata from the nearest package.json (one level up).
 *   2. Checks Node.js version and package manager availability.
 *   3. Installs Redis and PostgreSQL if they're not present, using whatever
 *      package manager the host OS actually has (apt, dnf, pacman, brew,
 *      winget, choco, scoop).
 *   4. Starts both services and verifies they accept connections.
 *   5. Creates the application database and a dedicated DB user.
 *   6. Writes a .env file with secure random secrets.
 *   7. Runs Prisma generate + db push, then compiles TypeScript and CSS.
 *
 * Flags:
 *   --yes / -y        Skip all "are you sure?" prompts.
 *   --skip-services   Skip Redis + PostgreSQL install/start (useful when
 *                     you're providing your own DB, e.g. Docker Compose).
 *   --skip-build      Skip the pnpm install + tsc + tailwind step.
 *   --db-host HOST    Override the PostgreSQL host (default: 127.0.0.1).
 *   --db-port PORT    Override the PostgreSQL port (default: 5432).
 *   --db-name NAME    Override the database name (default: airlink).
 *   --db-user USER    Override the DB username (default: airlink).
 *   --redis-url URL   Override the Redis connection URL.
 *   --help / -h       Show this message and exit.
 *
 * Usage examples:
 *   node public/scripts/setup.mjs
 *   node public/scripts/setup.mjs --yes
 *   node public/scripts/setup.mjs --skip-services --db-host=db.internal
 */

import { execSync, execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import chalk from "chalk";
import boxen from "boxen";

// ---
// Locate ourselves and load package.json from the project root (one level up
// from public/, which is where this file lives).
// ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "../..");

/** Pull name / version / author / license out of the nearest package.json. */
function loadPackageMeta() {
  const candidates = [
    resolve(projectDir, "package.json"),
    resolve(__dirname, "package.json"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        return {
          name: raw.name ?? "Panel",
          version: raw.version ?? "0.0.0",
          author:
            typeof raw.author === "object"
              ? (raw.author.name ?? "Unknown")
              : (raw.author ?? "Unknown"),
          license: raw.license ?? "Unknown",
          engines: raw.engines ?? {},
        };
      } catch {
        // Corrupted JSON - skip it and try the next candidate.
      }
    }
  }

  return {
    name: "Panel",
    version: "0.0.0",
    author: "Unknown",
    license: "MIT",
    engines: {},
  };
}

const PKG = loadPackageMeta();

// ---
// Platform detection
// ---

const PLATFORM = process.platform;
const ARCH = process.arch;
const IS_WIN = PLATFORM === "win32";
const IS_MAC = PLATFORM === "darwin";
const IS_LINUX = PLATFORM === "linux";

function detectLinuxPkgMgr() {
  for (const mgr of ["apt-get", "dnf", "yum", "pacman", "zypper", "apk"]) {
    if (which(mgr)) return mgr;
  }
  return null;
}

function detectMacPkgMgr() {
  if (which("brew")) return "brew";
  return null;
}

function detectWinPkgMgr() {
  for (const mgr of ["winget", "choco", "scoop"]) {
    if (which(mgr)) return mgr;
  }
  return null;
}

// ---
// Argument parsing
// ---

const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  for (let i = 0; i < argv.length; i++) {
    if (
      argv[i] === name &&
      argv[i + 1] !== undefined &&
      !argv[i + 1].startsWith("-")
    ) {
      return argv[i + 1];
    }
    if (argv[i].startsWith(`${name}=`)) {
      return argv[i].slice(name.length + 1);
    }
  }
  return fallback;
}

const opts = {
  yes: argv.includes("--yes") || argv.includes("-y"),
  help: argv.includes("--help") || argv.includes("-h"),
  skipServices: argv.includes("--skip-services"),
  skipBuild: argv.includes("--skip-build"),
  dbHost: flag("--db-host", "127.0.0.1"),
  dbPort: flag("--db-port", "5432"),
  dbName: flag("--db-name", "airlink"),
  dbUser: flag("--db-user", "airlink"),
  redisUrl: flag("--redis-url", null),
};

// ---
// Terminal colours
// ---

const TTY = process.stdout.isTTY;

const ok = (msg) => console.log(`  ${chalk.green("+")} ${msg}`);
const warn = (msg) =>
  console.log(`  ${chalk.yellow("!")} ${chalk.yellow(msg)}`);
const fail = (msg) => console.log(`  ${chalk.red("x")} ${chalk.red(msg)}`);
const info = (msg) => console.log(`  ${chalk.cyan("->")} ${msg}`);
const dim = (msg) => console.log(`  ${chalk.dim(msg)}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`  ${chalk.bold.blue(title)}`);
}

function banner() {
  if (TTY) {
    const ASCII = `  /$$$$$$ /$$         /$$/$$         /$$
 /$$__  $|__/        | $|__/        | $$
| $$   $$/$$ /$$$$$$| $$/$$/$$$$$$$| $$   /$$
| $$$$$$$| $$/$$__  $| $| $| $$__  $| $$  /$$/
| $$__  $| $| $$  __| $| $| $$   $| $$$$$$/
| $$  | $| $| $$     | $| $| $$  | $| $$_  $$
| $$  | $| $| $$     | $| $| $$  | $| $$ \\  $$
|__/  |__|__|__/     |__|__|__/  |__|__/  __/`;
    const lines = [
      chalk.cyan(ASCII),
      "",
      `  ${chalk.bold.cyan(PKG.name)} ${chalk.dim(`v${PKG.version}`)}`,
      `  ${chalk.dim(`Platform: ${PLATFORM} (${ARCH})`)}`,
      `  ${chalk.dim(`Node: ${process.version}`)}`,
      `  ${chalk.dim(`Project: ${projectDir}`)}`,
    ];
    console.log(
      boxen(lines.join("\n"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  } else {
    console.log(`  ${PKG.name} v${PKG.version}`);
    dim(`Platform: ${PLATFORM} (${ARCH})`);
    dim(`Node: ${process.version}`);
    dim(`Project: ${projectDir}`);
  }
  gap();
}

function showHelp() {
  banner();
  console.log(`${chalk.bold("Usage")}
  node public/scripts/setup.mjs [flags]

${chalk.bold("Flags")}
  --yes, -y           Accept all prompts (non-interactive / CI mode).
  --skip-services     Don't install or start Redis / PostgreSQL.
  --skip-build        Don't run pnpm install, tsc, or tailwindcss.
  --db-host HOST      PostgreSQL host      [default: 127.0.0.1]
  --db-port PORT      PostgreSQL port      [default: 5432]
  --db-name NAME      Database name        [default: airlink]
  --db-user USER      Database username    [default: airlink]
  --redis-url URL     Redis connection URL [default: redis://127.0.0.1:6379]
  --help, -h          Show this message.

${chalk.bold("Examples")}
  node public/scripts/setup.mjs
  node public/scripts/setup.mjs --yes
  node public/scripts/setup.mjs --skip-services --db-host=db.internal --yes
`);
  process.exit(0);
}

// ---
// Shell execution helpers
// ---

function run(cmd, extraOpts = {}) {
  try {
    const output = execSync(cmd, {
      stdio: "pipe",
      timeout: 120_000,
      cwd: projectDir,
      ...extraOpts,
    });
    const text = output?.toString().trim() ?? "";
    if (text) console.log(text);
    return text;
  } catch (error) {
    const text = error?.stderr?.toString().trim();
    if (text) console.error(text);
    return null;
  }
}

function runFile(file, args) {
  try {
    const output = execFileSync(file, args, {
      stdio: "pipe",
      timeout: 120_000,
      cwd: projectDir,
    });
    const text = output?.toString().trim() ?? "";
    if (text) console.log(text);
    return text;
  } catch (error) {
    const text = error?.stderr?.toString().trim();
    if (text) console.error(text);
    return null;
  }
}

function runLive(cmd, description) {
  info(description);
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    cwd: projectDir,
    timeout: 300_000,
  });
  if (result.status !== 0) {
    fail(`${description} - exited with code ${result.status ?? "unknown"}`);
    process.exit(1);
  }
}

function runOrDie(cmd, errMsg) {
  const result = run(cmd);
  if (result === null) {
    fail(errMsg);
    process.exit(1);
  }
  return result;
}

function which(bin) {
  return run(IS_WIN ? `where ${bin}` : `which ${bin}`);
}

function waitFor(check, attempts = 15) {
  return new Promise((resolve) => {
    const retry = (remaining) => {
      if (check()) return resolve(true);
      if (remaining <= 0) return resolve(false);
      setTimeout(() => retry(remaining - 1), 1000);
    };
    retry(attempts);
  });
}

// ---
// Interactive prompt helper
// ---

function ask(question) {
  if (opts.yes) return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `  ${chalk.yellow("?")} ${question} ${chalk.dim("[Y/n]")} `,
      (ans) => {
        rl.close();
        const lower = ans.trim().toLowerCase();
        resolve(lower === "" || lower === "y" || lower === "yes");
      },
    );
  });
}

// ---
// Cryptography helpers
// ---

function genPassword() {
  return randomBytes(32).toString("base64url");
}

function genSecret() {
  return randomBytes(32).toString("hex");
}

function readEnvFile() {
  const envPath = resolve(projectDir, ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) =>
        line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"']*)["']?\s*$/i),
      )
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function isTemplateEnv(env) {
  return env.SESSION_SECRET === "change_me";
}

function assertSqlIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(
      `${label} may contain only letters, numbers, and underscores (must start with a letter or underscore).`,
    );
  }
}

// ---
// Service management
// ---

function serviceIsActive(name) {
  if (IS_WIN) {
    const out = run(`sc query "${name}" 2>nul`);
    return out?.includes("RUNNING") ?? false;
  }
  if (IS_MAC) {
    const out = run(`launchctl list 2>/dev/null | grep "${name}"`);
    return !!out;
  }
  const systemd = run(`systemctl is-active "${name}" 2>/dev/null`);
  if (systemd === "active") return true;
  const sysv = run(`service "${name}" status 2>/dev/null; echo $?`, {
    timeout: 5_000,
  });
  return sysv?.split("\n").pop() === "0";
}

function startService(name, binaryFallback = null) {
  if (serviceIsActive(name)) return true;

  if (IS_WIN) {
    run(`net start "${name}" 2>nul || sc start "${name}" 2>nul`);
  } else if (IS_MAC) {
    run(
      `brew services start "${name}" 2>/dev/null || launchctl start "${name}" 2>/dev/null`,
    );
  } else {
    if (existsSync("/run/systemd/system")) {
      run(`sudo systemctl start "${name}" 2>/dev/null`, { timeout: 15_000 });
    }
    if (!serviceIsActive(name) && !existsSync("/run/systemd/system")) {
      run(`sudo service "${name}" start 2>/dev/null`, { timeout: 5_000 });
    }
    if (!serviceIsActive(name) && binaryFallback) {
      run(binaryFallback);
    }
  }

  return serviceIsActive(name);
}

function enableService(name) {
  if (IS_WIN) {
    run(`sc config "${name}" start= auto 2>nul`);
  } else if (IS_MAC) {
    run(`brew services restart "${name}" 2>/dev/null`);
  } else {
    run(`sudo systemctl enable "${name}" 2>/dev/null || true`);
  }
}

// ---
// Package installation
// ---

function buildInstallCmd(pkgMgr, packageMap) {
  const pkg = packageMap[pkgMgr];
  if (!pkg) return null;

  switch (pkgMgr) {
    case "apt-get":
      return `sudo apt-get update -qq && sudo apt-get install -y ${pkg}`;
    case "dnf":
      return `sudo dnf install -y ${pkg}`;
    case "yum":
      return `sudo yum install -y ${pkg}`;
    case "pacman":
      return `sudo pacman -Sy --noconfirm ${pkg}`;
    case "zypper":
      return `sudo zypper install -y ${pkg}`;
    case "apk":
      return `sudo apk add --no-cache ${pkg}`;
    case "brew":
      return `brew install ${pkg}`;
    case "winget":
      return `winget install --silent --accept-package-agreements --accept-source-agreements ${pkg}`;
    case "choco":
      return `choco install ${pkg} -y`;
    case "scoop":
      return `scoop install ${pkg}`;
    default:
      return null;
  }
}

// ---
// Pre-flight: Node version and pnpm
// ---

function checkNode() {
  section("Pre-flight checks");
  const minRaw = PKG.engines?.node?.replace(/[^0-9.]/g, "") ?? "22";
  const minMajor = parseInt(minRaw, 10) || 22;
  const curMajor = parseInt(process.versions.node, 10);

  if (curMajor < minMajor) {
    fail(`Node.js ${minMajor}+ required - you have ${process.version}.`);
    info(`Download the latest LTS from: https://nodejs.org`);
    process.exit(1);
  }
  ok(`Node.js ${process.version} (need >= ${minMajor})`);
}

function checkPnpm() {
  const ver = run("pnpm --version");
  if (!ver) {
    warn("pnpm not found - installing it now via npm...");
    const installed = run("npm install -g pnpm", { stdio: "inherit" });
    if (!which("pnpm")) {
      fail("Could not install pnpm. Run:  npm install -g pnpm");
      process.exit(1);
    }
    ok(`pnpm ${run("pnpm --version")}`);
  } else {
    ok(`pnpm ${ver}`);
  }
}

// ---
// Redis
// ---

function getRedisInstallCmd() {
  if (IS_LINUX) {
    const mgr = detectLinuxPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      "apt-get": "redis-server",
      dnf: "redis",
      yum: "redis",
      pacman: "redis",
      zypper: "redis",
      apk: "redis",
    });
  }
  if (IS_MAC) {
    const mgr = detectMacPkgMgr();
    return mgr ? buildInstallCmd(mgr, { brew: "redis" }) : null;
  }
  if (IS_WIN) {
    const mgr = detectWinPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      winget: "Redis.Redis",
      choco: "redis-64",
      scoop: "redis",
    });
  }
  return null;
}

async function ensureRedis() {
  section("Redis");

  const redisBin = which("redis-server") || which("redis-server.exe");

  if (!redisBin) {
    warn("redis-server not found on PATH");
    const proceed = await ask("Install Redis automatically?");
    if (!proceed) {
      fail("Redis is required. Install it manually, then re-run setup.");
      process.exit(1);
    }

    const cmd = getRedisInstallCmd();
    if (!cmd) {
      fail("Could not determine how to install Redis on this system.");
      printManualRedisInstructions();
      process.exit(1);
    }

    info(`Installing Redis via: ${cmd}`);
    const result = run(cmd);
    if (result === null) {
      fail("Redis install failed.");
      printManualRedisInstructions();
      process.exit(1);
    }
    ok("Redis installed");
  } else {
    ok(`redis-server found at ${redisBin}`);
  }

  const serviceName = IS_WIN ? "Redis" : IS_MAC ? "redis" : "redis-server";

  const redisCliPath =
    which("redis-cli") || which("redis-cli.exe") || "redis-cli";
  const redisReady = () => run(`${redisCliPath} ping 2>/dev/null`) === "PONG";

  if (!redisReady() && !serviceIsActive(serviceName)) {
    warn(`Redis service "${serviceName}" is not running`);
    const daemonFallback = IS_WIN
      ? null
      : "redis-server --daemonize yes 2>/dev/null";
    if (!startService(serviceName, daemonFallback)) {
      fail("Could not start Redis. Start it manually, then re-run setup.");
      process.exit(1);
    }
    enableService(serviceName);
    ok("Redis started and enabled");
  } else {
    ok("Redis is running");
  }

  if (!(await waitFor(redisReady))) {
    fail("redis-cli ping did not return PONG. Check your Redis config.");
    process.exit(1);
  }
  ok("Redis ping -> PONG");
}

function printManualRedisInstructions() {
  warn("Install Redis manually:");
  if (IS_LINUX) {
    warn("  Ubuntu/Debian : sudo apt install redis-server");
    warn("  Fedora/RHEL   : sudo dnf install redis");
    warn("  Arch          : sudo pacman -S redis");
    warn("  Alpine        : sudo apk add redis");
  }
  if (IS_MAC) warn("  macOS         : brew install redis");
  if (IS_WIN) {
    warn("  winget        : winget install Redis.Redis");
    warn("  Chocolatey    : choco install redis-64");
    warn("  Scoop         : scoop install redis");
  }
  warn("  Docker        : docker run -d -p 6379:6379 redis:alpine");
}

// ---
// PostgreSQL
// ---

function getPostgresInstallCmd() {
  if (IS_LINUX) {
    const mgr = detectLinuxPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      "apt-get": "postgresql postgresql-contrib",
      dnf: "postgresql-server postgresql",
      yum: "postgresql-server postgresql",
      pacman: "postgresql",
      zypper: "postgresql-server postgresql",
      apk: "postgresql postgresql-contrib",
    });
  }
  if (IS_MAC) {
    const mgr = detectMacPkgMgr();
    return mgr ? buildInstallCmd(mgr, { brew: "postgresql@16" }) : null;
  }
  if (IS_WIN) {
    const mgr = detectWinPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      winget: "PostgreSQL.PostgreSQL.16",
      choco: "postgresql",
      scoop: "postgresql",
    });
  }
  return null;
}

function detectPostgresServiceName() {
  for (const name of [
    "postgresql",
    "postgres",
    "pg",
    "postgresql@16",
    "postgresql@15",
    "postgresql@14",
  ]) {
    const out = run(
      `systemctl status "${name}" 2>/dev/null || service "${name}" status 2>/dev/null; echo x`,
      { timeout: 5_000 },
    );
    if (out && !out.includes("not-found") && !out.includes("unrecognized"))
      return name;
  }
  return "postgresql"; // best guess
}

function startPostgresFallback() {
  if (!IS_LINUX) return false;
  // Try pg_ctl directly
  const pgBin = which("pg_ctl") || which("pg_ctlcluster");
  if (!pgBin) return false;
  const dataDir = run("sudo -u postgres pg_config --sharedir 2>/dev/null");
  return (
    run(
      "sudo -u postgres pg_ctl start -D /var/lib/postgresql/data -l /tmp/airlink-postgres.log 2>/dev/null &",
    ) !== null
  );
}

async function ensurePostgres() {
  section("PostgreSQL");

  const pgBin = which("psql") || which("psql.exe");

  if (!pgBin) {
    warn("psql (PostgreSQL client) not found on PATH");
    const proceed = await ask("Install PostgreSQL automatically?");
    if (!proceed) {
      fail("PostgreSQL is required. Install it manually, then re-run setup.");
      process.exit(1);
    }

    const cmd = getPostgresInstallCmd();
    if (!cmd) {
      fail("Could not determine how to install PostgreSQL on this system.");
      printManualPostgresInstructions();
      process.exit(1);
    }

    info(`Installing PostgreSQL via: ${cmd}`);
    const result = run(cmd);
    if (result === null) {
      fail("PostgreSQL install failed.");
      printManualPostgresInstructions();
      process.exit(1);
    }
    ok("PostgreSQL installed");

    // Initialize the database cluster if needed (some distros need this)
    if (IS_LINUX) {
      const dataDir = run("sudo -u postgres pg_config --datadir 2>/dev/null");
      if (dataDir && !existsSync(dataDir.trim())) {
        const initdb = which("initdb") || which("pg_ctlcluster");
        if (initdb) {
          run(
            "sudo -u postgres initdb -D /var/lib/postgresql/data 2>/dev/null || true",
          );
        }
      }
    }
  } else {
    ok(`psql found at ${pgBin}`);
  }

  const serviceName = IS_WIN
    ? "postgresql-x64-16"
    : IS_MAC
      ? "postgresql"
      : detectPostgresServiceName();

  const pgReady = () => {
    const result = run(
      `sudo -u postgres psql -t -c "SELECT 1" 2>/dev/null || psql -U postgres -t -c "SELECT 1" 2>/dev/null`,
      { timeout: 5_000 },
    );
    return result?.trim() === "1";
  };

  if (!pgReady() && (IS_LINUX ? !serviceIsActive(serviceName) : true)) {
    warn(`PostgreSQL service "${serviceName}" is not running`);
    const started = startService(serviceName, startPostgresFallback());
    if (!pgReady() && !started) {
      fail("Could not start PostgreSQL. Start it manually, then re-run setup.");
      printManualPostgresInstructions();
      process.exit(1);
    }
    enableService(serviceName);
    ok("PostgreSQL started and enabled");
  } else {
    ok("PostgreSQL is running");
  }

  const conn = await waitFor(pgReady);
  if (!conn) {
    fail("Cannot connect to PostgreSQL as postgres user.");
    warn("Check your PostgreSQL authentication config (pg_hba.conf).");
    process.exit(1);
  }
  ok("PostgreSQL postgres connection OK");
}

function printManualPostgresInstructions() {
  warn("Install PostgreSQL manually:");
  if (IS_LINUX) {
    warn("  Ubuntu/Debian : sudo apt install postgresql postgresql-contrib");
    warn("  Fedora/RHEL   : sudo dnf install postgresql-server postgresql");
    warn("  Arch          : sudo pacman -S postgresql");
    warn("  Alpine        : sudo apk add postgresql postgresql-contrib");
  }
  if (IS_MAC) warn("  macOS         : brew install postgresql@16");
  if (IS_WIN) {
    warn("  winget        : winget install PostgreSQL.PostgreSQL.16");
    warn("  Chocolatey    : choco install postgresql");
  }
  warn(
    "  Docker        : docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=airlink postgres:16",
  );
}

// ---
// Run a SQL statement via the postgres superuser (postgres).
// Returns trimmed stdout, or null on failure.
// ---

function psql(statement) {
  const args = ["-U", "postgres", "-t", "-A", "-c", statement];
  return (
    runFile("sudo", ["-u", "postgres", "psql", ...args]) ??
    runFile("psql", ["-U", "postgres", ...args]) ??
    runFile("psql", args)
  );
}

// Run a SQL statement with a specific database.
function psqlDb(dbName, statement) {
  const args = ["-U", "postgres", "-d", dbName, "-t", "-A", "-c", statement];
  return (
    runFile("sudo", ["-u", "postgres", "psql", ...args]) ??
    runFile("psql", ["-U", "postgres", "-d", dbName, ...args]) ??
    runFile("psql", ["-d", dbName, ...args])
  );
}

// ---
// Database + user setup
// ---

async function setupDatabase() {
  section("Database");

  const loadedEnv = readEnvFile();
  const existingEnv = isTemplateEnv(loadedEnv) ? {} : loadedEnv;
  let existingUrl;
  try {
    existingUrl = existingEnv.DATABASE_URL
      ? new URL(existingEnv.DATABASE_URL)
      : null;
  } catch {
    throw new Error("DATABASE_URL in .env is not a valid URL.");
  }

  const dbHost = existingEnv.PGHOST ?? existingUrl?.hostname ?? opts.dbHost;
  const dbPort = existingEnv.PGPORT ?? existingUrl?.port ?? opts.dbPort;
  const dbName = existingUrl?.pathname.slice(1) || opts.dbName;
  const dbUser = existingEnv.PGUSER ?? existingUrl?.username ?? opts.dbUser;
  const dbPass =
    existingEnv.PGPASSWORD ?? existingUrl?.password ?? genPassword();
  assertSqlIdentifier(dbName, "Database name");
  assertSqlIdentifier(dbUser, "Database user");

  // Database
  const dbExists = psql(
    `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
  );

  if (!dbExists || !dbExists.trim()) {
    info(`Creating database "${dbName}"...`);
    if (psql(`CREATE DATABASE "${dbName}"`) === null) {
      throw new Error(`Could not create database "${dbName}".`);
    }
    ok(`Database "${dbName}" created`);
  } else {
    ok(`Database "${dbName}" already exists`);
  }

  // User / Role
  const userExists = psql(`SELECT 1 FROM pg_roles WHERE rolname = '${dbUser}'`);

  if (existingEnv.PGUSER || existingUrl) {
    ok("Using database credentials from existing .env");
  }

  if (!userExists || !userExists.trim()) {
    info(`Creating database role "${dbUser}"...`);
    psql(`CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPass}'`);
  } else {
    info(`Role "${dbUser}" already exists - refreshing password...`);
    psql(`ALTER ROLE "${dbUser}" WITH PASSWORD '${dbPass}'`);
  }

  // Grant privileges
  psql(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
  psql(`GRANT ALL ON SCHEMA public TO "${dbUser}"`);
  psql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`,
  );
  psql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`,
  );
  ok(`Role "${dbUser}" configured with full access to "${dbName}"`);

  // Verify
  const testCmd = `psql -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} -t -A -c "SELECT 1" 2>/dev/null`;
  const testConn = run(`PGPASSWORD=${dbPass} ${testCmd}`);

  if (testConn?.trim() !== "1") {
    fail(
      `Could not connect as "${dbUser}". Check your PostgreSQL pg_hba.conf and listen_addresses.`,
    );
    process.exit(1);
  }
  ok(`Connection as "${dbUser}" verified`);

  return { dbHost, dbPort, dbName, dbUser, dbPass };
}

// ---
// .env generation
// ---

function generateEnv(creds) {
  section("Environment file");

  const envPath = resolve(projectDir, ".env");

  const existingEnv = readEnvFile();
  if (existsSync(envPath) && !isTemplateEnv(existingEnv)) {
    warn(".env already exists - leaving it untouched.");
    info("Delete it and re-run setup to regenerate with fresh secrets.");
    return;
  }

  const { dbHost, dbPort, dbName, dbUser, dbPass } = creds;
  const redisUrl = opts.redisUrl ?? "redis://127.0.0.1:6379";
  const sessionSecret = genSecret();

  const lines = [
    "#",
    `# ${PKG.name} - environment configuration`,
    `# Generated by setup.mjs on ${new Date().toISOString()}`,
    "#",
    "",
    "# Application",
    'URL="http://localhost:3000"',
    'PORT="3000"',
    `NAME="${PKG.name}"`,
    'NODE_ENV="production"',
    "",
    "# Session",
    `SESSION_SECRET="${sessionSecret}"`,
    "",
    "# Database (Prisma)",
    `DATABASE_URL="postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}"`,
    "",
    "# Database (raw credentials, used by the DB-host auto-generator)",
    `PGHOST="${dbHost}"`,
    `PGPORT="${dbPort}"`,
    `PGUSER="${dbUser}"`,
    `PGPASSWORD="${dbPass}"`,
    "",
    "# Redis",
    `REDIS_URL="${redisUrl}"`,
    "",
  ];

  writeFileSync(envPath, lines.join("\n"), "utf-8");
  ok(".env written with a fresh SESSION_SECRET");
  dim(`  Path: ${envPath}`);
}

// ---
// Prisma
// ---

function runPrisma() {
  section("Prisma");

  runLive("pnpm exec prisma generate", "Generating Prisma client...");
  ok("prisma generate");

  runLive("pnpm exec prisma db push", "Pushing schema to database...");
  ok("prisma db push");
}

// ---
// Build
// ---

function runBuild() {
  section("Build");

  runLive("pnpm install", "Installing dependencies...");
  ok("pnpm install");

  info("Compiling TypeScript (main)...");
  const tsc1 = run("pnpm exec tsc 2>&1");
  if (tsc1 === null) {
    warn(
      "tsc (main) reported errors - the build may still work. Check manually.",
    );
  } else {
    ok("tsc (main)");
  }

  info("Compiling TypeScript (prisma tsconfig)...");
  const tsc2 = run("pnpm exec tsc -p tsconfig.prisma.json 2>&1");
  if (tsc2 === null) {
    warn("tsc (prisma) reported errors - check manually.");
  } else {
    ok("tsc (prisma)");
  }

  info("Building CSS with Tailwind...");
  const css = run(
    "pnpm exec tailwindcss -i ./public/styles/tw.css -o ./public/styles.css 2>&1",
  );
  if (css === null) {
    warn(
      "Tailwind CSS build failed - styles may be stale. Run: pnpm run build:css",
    );
  } else {
    ok("Tailwind CSS compiled");
  }
}

// ---
// Summary
// ---

function printSummary(creds) {
  gap();
  console.log(`  ${chalk.bold.green("Setup complete!")}`);
  gap();

  console.log(`  ${chalk.bold("Database credentials")}`);
  console.log(`  Host      ${chalk.cyan(creds.dbHost)}`);
  console.log(`  Port      ${chalk.cyan(creds.dbPort)}`);
  console.log(`  Database  ${chalk.cyan(creds.dbName)}`);
  console.log(`  User      ${chalk.cyan(creds.dbUser)}`);
  console.log(`  Password  ${chalk.cyan(creds.dbPass)}`);
  gap();

  console.log(`  ${chalk.bold("DATABASE_URL")}`);
  console.log(
    `  ${chalk.dim(`postgresql://${creds.dbUser}:${creds.dbPass}@${creds.dbHost}:${creds.dbPort}/${creds.dbName}`)}`,
  );
  gap();

  console.log(`  ${chalk.bold("Next steps")}`);
  console.log(
    `  ${chalk.green("->")}  Start the panel   ${chalk.bold("pnpm run start")}`,
  );
  console.log(
    `  ${chalk.green("->")}  Dev mode (watch)  ${chalk.bold("pnpm run dev")}`,
  );
  console.log(
    `  ${chalk.green("->")}  Config file       ${chalk.bold(".env")}  (in project root)`,
  );
  gap();
}

// ---
// Entry point
// ---

async function main() {
  if (opts.help) showHelp();

  banner();

  checkNode();
  checkPnpm();

  if (opts.skipServices) {
    section("Services");
    warn("--skip-services: skipping Redis and PostgreSQL install/start.");
  } else {
    await ensureRedis();
    await ensurePostgres();
  }

  const creds = await setupDatabase();

  generateEnv(creds);

  runPrisma();

  if (opts.skipBuild) {
    section("Build");
    warn("--skip-build: skipping pnpm install and compilation.");
  } else {
    runBuild();
  }

  printSummary(creds);
}

main().catch((err) => {
  gap();
  fail(`Setup failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  gap();
  process.exit(1);
});
