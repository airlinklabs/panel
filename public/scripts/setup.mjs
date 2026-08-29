#!/usr/bin/env node

/**
 * setup.mjs - first-run installer for the panel.
 *
 * What it does:
 *   1. Reads project metadata from the nearest package.json (one level up).
 *   2. Checks Node.js version and package manager availability.
 *   3. Installs Redis and MariaDB if they're not present, using whatever
 *      package manager the host OS actually has (apt, dnf, pacman, brew,
 *      winget, choco, scoop).
 *   4. Starts both services and verifies they accept connections.
 *   5. Creates the application database and a dedicated DB user.
 *   6. Writes a .env file with secure random secrets.
 *   7. Runs Prisma generate + db push, then compiles TypeScript and CSS.
 *
 * Flags:
 *   --yes / -y        Skip all "are you sure?" prompts.
 *   --skip-services   Skip Redis + MariaDB install/start (useful when
 *                     you're providing your own DB, e.g. Docker Compose).
 *   --skip-build      Skip the pnpm install + tsc + tailwind step.
 *   --db-host HOST    Override the MariaDB host (default: 127.0.0.1).
 *   --db-port PORT    Override the MariaDB port (default: 3306).
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
// Platform detection - we use this throughout to pick the right install
// commands and service management approach.
// ---

const PLATFORM = process.platform; // 'linux' | 'darwin' | 'win32'
const ARCH = process.arch; // 'x64' | 'arm64' | 'arm' | ...
const IS_WIN = PLATFORM === "win32";
const IS_MAC = PLATFORM === "darwin";
const IS_LINUX = PLATFORM === "linux";

/** Detect the Linux package manager by checking which binaries exist. */
function detectLinuxPkgMgr() {
  for (const mgr of ["apt-get", "dnf", "yum", "pacman", "zypper", "apk"]) {
    if (which(mgr)) return mgr;
  }
  return null;
}

/** Detect macOS package manager (homebrew is overwhelmingly dominant). */
function detectMacPkgMgr() {
  if (which("brew")) return "brew";
  return null;
}

/** Detect Windows package manager - try winget, choco, scoop in that order. */
function detectWinPkgMgr() {
  for (const mgr of ["winget", "choco", "scoop"]) {
    if (which(mgr)) return mgr;
  }
  return null;
}

// ---
// Argument parsing - intentionally hand-rolled so we have zero dependencies
// at setup time (no commander, no yargs).
// ---

const argv = process.argv.slice(2);

/** Return the value of a CLI flag, or null if it wasn't passed.
 *  Handles both "--flag value" and "--flag=value" styles. */
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
  dbPort: flag("--db-port", "3306"),
  dbName: flag("--db-name", "airlink"),
  dbUser: flag("--db-user", "airlink"),
  redisUrl: flag("--redis-url", null),
};

// ---
// Terminal colours - we only apply them when stdout is actually a TTY.
// Piped output (CI logs, redirected files) stays clean.
// ---

const TTY = process.stdout.isTTY;

// ---
// Logging helpers (chalk-based)
// ---

const ok = (msg) => console.log(`  ${chalk.green("+")} ${msg}`);
const warn = (msg) =>
  console.log(`  ${chalk.yellow("!")} ${chalk.yellow(msg)}`);
const fail = (msg) => console.log(`  ${chalk.red("x")} ${chalk.red(msg)}`);
const info = (msg) => console.log(`  ${chalk.cyan("->")} ${msg}`);
const dim = (msg) => console.log(`  ${chalk.dim(msg)}`);
const gap = () => console.log();

/** Print a plain section header. */
function section(title) {
  gap();
  console.log(`  ${chalk.bold.blue(title)}`);
}

/** Print project metadata without decorative framing. */
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

/** Print the --help text and exit cleanly. */
function showHelp() {
  banner();
  console.log(`${chalk.bold}Usage${reset}
  node public/scripts/setup.mjs [flags]

${C.bold}Flags${C.reset}
  --yes, -y           Accept all prompts (non-interactive / CI mode).
  --skip-services     Don't install or start Redis / MariaDB.
  --skip-build        Don't run pnpm install, tsc, or tailwindcss.
  --db-host HOST      MariaDB host          [default: 127.0.0.1]
  --db-port PORT      MariaDB port          [default: 3306]
  --db-name NAME      Database name         [default: airlink]
  --db-user USER      Database username     [default: airlink]
  --redis-url URL     Redis connection URL  [default: redis://127.0.0.1:6379]
  --help, -h          Show this message.

${C.bold}Examples${C.reset}
  node public/scripts/setup.mjs
  node public/scripts/setup.mjs --yes
  node public/scripts/setup.mjs --skip-services --db-host=db.internal --yes
`);
  process.exit(0);
}

// ---
// Shell execution helpers
// ---

/**
 * Run a command and return its trimmed stdout, or null on failure.
 * We swallow stderr by default so the terminal doesn't fill up with noise
 * during the many "does X exist?" probes.
 */
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

/**
 * Run a command and stream its output live to the terminal.
 * Use this for long-running things (pnpm install, tsc) so the user
 * can see progress rather than staring at a frozen cursor.
 */
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

/** Like run(), but exits the process on failure rather than returning null. */
function runOrDie(cmd, errMsg) {
  const result = run(cmd);
  if (result === null) {
    fail(errMsg);
    process.exit(1);
  }
  return result;
}

/** Check if a binary is on PATH. */
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

/**
 * Ask a yes/no question in the terminal.
 * Returns true immediately in --yes mode without printing anything.
 */
function ask(question) {
  if (opts.yes) return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `  ${C.yellow}?${C.reset} ${question} ${C.dim}[Y/n]${C.reset} `,
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

/** 32-byte URL-safe random string - suitable for DB passwords. */
function genPassword() {
  return randomBytes(32).toString("base64url");
}

/** 64-hex-character string - suitable for session secrets. */
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
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(
      `${label} may contain only letters, numbers, and underscores.`,
    );
  }
}

// ---
// Service management - handles systemd, SysV init, launchctl, Windows SCM,
// and bare-binary fallbacks for each case.
// ---

/**
 * Check whether a named service is currently running.
 * Tries systemd first, then SysV, then macOS launchd, then Windows SC.
 */
function serviceIsActive(name) {
  if (IS_WIN) {
    const out = run(`sc query "${name}" 2>nul`);
    return out?.includes("RUNNING") ?? false;
  }
  if (IS_MAC) {
    // launchctl reports "enabled" or the service PID when running.
    const out = run(`launchctl list 2>/dev/null | grep "${name}"`);
    return !!out;
  }
  // Linux - try systemd first, fall back to SysV.
  const systemd = run(`systemctl is-active "${name}" 2>/dev/null`);
  if (systemd === "active") return true;
  const sysv = run(`service "${name}" status 2>/dev/null; echo $?`, {
    timeout: 5_000,
  });
  return sysv?.split("\n").pop() === "0";
}

/**
 * Try to start a named service, returning true if it ended up running.
 * Works across systemd, SysV, launchctl (macOS), and Windows SC.
 */
function startService(name, binaryFallback = null) {
  if (serviceIsActive(name)) return true;

  if (IS_WIN) {
    run(`net start "${name}" 2>nul || sc start "${name}" 2>nul`);
  } else if (IS_MAC) {
    run(
      `brew services start "${name}" 2>/dev/null || launchctl start "${name}" 2>/dev/null`,
    );
  } else {
    // Containers often ship a systemctl shim without a running systemd.
    if (existsSync("/run/systemd/system")) {
      run(`sudo systemctl start "${name}" 2>/dev/null`, { timeout: 15_000 });
    }
    if (!serviceIsActive(name) && !existsSync("/run/systemd/system")) {
      // SysV init fallback (older Debian, Alpine, WSL1, some containers).
      run(`sudo service "${name}" start 2>/dev/null`, { timeout: 5_000 });
    }
    if (!serviceIsActive(name) && binaryFallback) {
      // Last resort: launch the daemon directly in the background.
      run(binaryFallback);
    }
  }

  return serviceIsActive(name);
}

function startMariaDBFallback() {
  if (!IS_LINUX || !which("mariadbd")) return false;
  run("sudo mkdir -p /run/mysqld && sudo chown mysql:mysql /run/mysqld");
  return (
    run(
      "sudo -u mysql mariadbd --no-defaults --user=mysql --datadir=/var/lib/mysql --bind-address=127.0.0.1 --port=3306 --socket=/run/mysqld/mysqld.sock --pid-file=/run/mysqld/mysqld.pid >/tmp/airlink-mariadb.log 2>&1 &",
    ) !== null
  );
}

function initializeMariaDB() {
  if (!IS_LINUX || !which("mariadbd")) return true;
  const systemTable =
    run("sudo test -f /var/lib/mysql/mysql/db.frm") !== null ||
    run("sudo test -f /var/lib/mysql/mysql/db.ibd") !== null;
  if (systemTable) return true;

  info("Initializing MariaDB system tables...");
  const initializer = which("mariadb-install-db") || which("mysql_install_db");
  if (!initializer) return false;
  run("id mysql >/dev/null 2>&1 || sudo useradd -r -s /bin/false mysql");
  run(
    "sudo mkdir -p /var/lib/mysql && sudo chown -R mysql:mysql /var/lib/mysql",
  );
  return (
    run(
      `sudo -u mysql ${initializer} --no-defaults --user=mysql --basedir=/usr --datadir=/var/lib/mysql`,
    ) !== null
  );
}

/** Enable a service so it starts on boot. Best-effort - failures are logged but non-fatal. */
function enableService(name) {
  if (IS_WIN) {
    run(`sc config "${name}" start= auto 2>nul`);
  } else if (IS_MAC) {
    run(`brew services restart "${name}" 2>/dev/null`); // brew already auto-enables
  } else {
    run(`sudo systemctl enable "${name}" 2>/dev/null || true`);
  }
}

// ---
// Package installation - maps the generic action "install pkg X" onto
// whatever package manager the host actually has.
// ---

/**
 * Build the shell command that installs a package on this platform.
 *
 * packageMap example:
 *   {
 *     'apt-get': 'redis-server',
 *     'dnf':     'redis',
 *     'pacman':  'redis',
 *     'brew':    'redis',
 *     'winget':  'Redis.Redis',
 *     'choco':   'redis',
 *     'scoop':   'redis',
 *   }
 */
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

  // Pull the minimum version from engines.node in package.json, or fall
  // back to 22 which is what this project currently requires.
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

/**
 * Resolve which package manager is available on this host, then return
 * the install command for redis-server (or the platform-appropriate name).
 */
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

  // On Linux/Mac we manage it as a service. On Windows the installer usually
  // registers a service automatically, but we try both paths.
  const serviceName = IS_WIN ? "Redis" : IS_MAC ? "redis" : "redis-server";

  const redisCliPath =
    which("redis-cli") || which("redis-cli.exe") || "redis-cli";
  const redisReady = () => run(`${redisCliPath} ping 2>/dev/null`) === "PONG";

  if (!redisReady() && !serviceIsActive(serviceName)) {
    warn(`Redis service "${serviceName}" is not running`);
    // Binary fallback: launch redis in the background if service management fails.
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

  // Verify the server actually responds before we move on.
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
// MariaDB
// ---

function getMariaDBInstallCmd() {
  if (IS_LINUX) {
    const mgr = detectLinuxPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      "apt-get": "mariadb-server",
      dnf: "mariadb-server",
      yum: "mariadb-server",
      pacman: "mariadb",
      zypper: "mariadb",
      apk: "mariadb mariadb-openrc",
    });
  }
  if (IS_MAC) {
    const mgr = detectMacPkgMgr();
    return mgr ? buildInstallCmd(mgr, { brew: "mariadb" }) : null;
  }
  if (IS_WIN) {
    const mgr = detectWinPkgMgr();
    if (!mgr) return null;
    return buildInstallCmd(mgr, {
      winget: "MariaDB.Server",
      choco: "mariadb",
      scoop: "mariadb",
    });
  }
  return null;
}

async function ensureMariaDB() {
  section("MariaDB");

  const mariadBin =
    which("mariadbd") ||
    which("mysqld") ||
    which("mariadbd.exe") ||
    which("mysqld.exe");

  if (!mariadBin) {
    warn("MariaDB server binary not found on PATH");
    const proceed = await ask("Install MariaDB automatically?");
    if (!proceed) {
      fail("MariaDB is required. Install it manually, then re-run setup.");
      process.exit(1);
    }

    const cmd = getMariaDBInstallCmd();
    if (!cmd) {
      fail("Could not determine how to install MariaDB on this system.");
      printManualMariaDBInstructions();
      process.exit(1);
    }

    info(`Installing MariaDB via: ${cmd}`);
    const result = run(cmd);
    if (result === null) {
      fail("MariaDB install failed.");
      printManualMariaDBInstructions();
      process.exit(1);
    }
    ok("MariaDB installed");

    // Some distros (Arch, Alpine) need the data directory initialised before
    // the service can start.
    if (IS_LINUX) {
      run(
        "sudo -u mysql mysql_install_db --user=mysql --basedir=/usr --datadir=/var/lib/mysql 2>/dev/null || true",
      );
    }
  } else {
    ok(`MariaDB found at ${mariadBin}`);
  }

  if (!initializeMariaDB()) {
    fail("Could not initialize MariaDB system tables.");
    printManualMariaDBInstructions();
    process.exit(1);
  }

  // Service name varies by distro.
  const serviceName = IS_WIN
    ? "MySQL"
    : IS_MAC
      ? "mariadb"
      : detectMariaDBServiceName();

  const rootClient = which("mariadb") || which("mysql");
  const mariaReady = () =>
    rootClient &&
    (run(`${rootClient} --no-defaults -u root -N -e "SELECT 1" 2>/dev/null`) ===
      "1" ||
      run(
        `sudo ${rootClient} --no-defaults -u root -N -e "SELECT 1" 2>/dev/null`,
      ) === "1");

  const hasSystemd = existsSync("/run/systemd/system");

  if (!mariaReady() && (hasSystemd ? !serviceIsActive(serviceName) : true)) {
    warn(`MariaDB service "${serviceName}" is not running`);
    const started = existsSync("/run/systemd/system")
      ? startService(serviceName)
      : startMariaDBFallback();
    if (!mariaReady() && !started && !startMariaDBFallback()) {
      fail("Could not start MariaDB. Start it manually, then re-run setup.");
      printManualMariaDBInstructions();
      process.exit(1);
    }
    enableService(serviceName);
    ok("MariaDB started and enabled");
  } else {
    ok("MariaDB is running");
  }

  // Verify root can connect without a password.
  // On a fresh install this is typically the case; if it fails we print
  // a helpful message rather than just dying.
  const conn = await waitFor(mariaReady);

  if (!conn) {
    fail("Cannot connect to MariaDB as root without a password.");
    warn(
      "If root has a password, set MYSQL_ROOT_PASSWORD=yourpass before re-running,",
    );
    warn(
      "or run: sudo mariadb -u root  and grant the app user access manually.",
    );
    process.exit(1);
  }
  ok("MariaDB root connection OK");
}

/** Different distros register MariaDB under different service names. */
function detectMariaDBServiceName() {
  for (const name of ["mariadb", "mysql", "mysqld", "mariadbd"]) {
    const out = run(
      `systemctl status "${name}" 2>/dev/null || service "${name}" status 2>/dev/null; echo x`,
      { timeout: 5_000 },
    );
    if (out && !out.includes("not-found") && !out.includes("unrecognized"))
      return name;
  }
  return "mariadb"; // best guess
}

function printManualMariaDBInstructions() {
  warn("Install MariaDB manually:");
  if (IS_LINUX) {
    warn("  Ubuntu/Debian : sudo apt install mariadb-server");
    warn("  Fedora/RHEL   : sudo dnf install mariadb-server");
    warn("  Arch          : sudo pacman -S mariadb");
    warn("  Alpine        : sudo apk add mariadb");
  }
  if (IS_MAC) warn("  macOS         : brew install mariadb");
  if (IS_WIN) {
    warn("  winget        : winget install MariaDB.Server");
    warn("  Chocolatey    : choco install mariadb");
  }
  warn(
    "  Docker        : docker run -d -p 3306:3306 -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:latest",
  );
}

// ---
// Helper to run a raw SQL statement via the root MariaDB client.
// Returns the trimmed stdout, or null on failure.
// ---

function sql(statement) {
  // Pass SQL as an argument so shell syntax in identifiers is not evaluated.
  const args = ["--no-defaults", "-u", "root", "-N", "-e", statement];
  return (
    runFile("sudo", ["mariadb", ...args]) ??
    runFile("sudo", ["mysql", ...args]) ??
    runFile("mariadb", args) ??
    runFile("mysql", args)
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

  const dbHost = existingEnv.MYSQL_HOST ?? existingUrl?.hostname ?? opts.dbHost;
  const dbPort = existingEnv.MYSQL_PORT ?? existingUrl?.port ?? opts.dbPort;
  const dbName = existingUrl?.pathname.slice(1) || opts.dbName;
  const dbUser = existingEnv.MYSQL_USER ?? existingUrl?.username ?? opts.dbUser;
  const dbPass =
    existingEnv.MYSQL_PASSWORD ?? existingUrl?.password ?? genPassword();
  assertSqlIdentifier(dbName, "Database name");
  assertSqlIdentifier(dbUser, "Database user");

  // Database
  const dbExists = sql(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}'`,
  );

  if (!dbExists) {
    info(`Creating database \`${dbName}\`...`);
    if (
      sql(
        `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      ) === null
    ) {
      throw new Error(`Could not create database \`${dbName}\`.`);
    }
    ok(`Database \`${dbName}\` created`);
  } else {
    ok(`Database \`${dbName}\` already exists`);
  }

  // User
  const userExists = sql(
    `SELECT user FROM mysql.user WHERE user = '${dbUser}'`,
  );

  if (existingEnv.MYSQL_USER || existingUrl) {
    ok("Using database credentials from existing .env");
  }

  // Ensure the configured account matches .env, including after a local
  // database has been removed and installed again.

  if (!userExists) {
    info(`Creating database user "${dbUser}"...`);
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      sql(
        `CREATE USER IF NOT EXISTS '${dbUser}'@'${host}' IDENTIFIED BY '${dbPass}'`,
      );
      sql(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'${host}'`);
    }
  } else {
    info(`User "${dbUser}" already exists - refreshing password and grants...`);
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      // ALTER USER is safer than DROP + CREATE when the user has objects.
      sql(`ALTER USER '${dbUser}'@'${host}' IDENTIFIED BY '${dbPass}'`);
      sql(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'${host}'`);
    }
  }

  sql("FLUSH PRIVILEGES");
  ok(`User "${dbUser}" configured with full access to \`${dbName}\``);

  // Verify
  const passwordArg = dbPass ? ` -p${dbPass}` : "";
  const testCmd =
    `mariadb --no-defaults -u ${dbUser}${passwordArg} -h ${dbHost} -P ${dbPort} -N -e "SELECT 1" 2>/dev/null` +
    ` || mysql --no-defaults -u ${dbUser}${passwordArg} -h ${dbHost} -P ${dbPort} -N -e "SELECT 1" 2>/dev/null`;
  const testConn = run(testCmd);

  if (testConn !== "1") {
    fail(
      `Could not connect as "${dbUser}". Check your MariaDB bind-address and auth config.`,
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

  // We write every value with double-quotes so the file is easy to
  // parse in shell scripts and across all platforms.
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
    `DATABASE_URL="mysql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}"`,
    "",
    "# Database (raw credentials, used by the DB-host auto-generator)",
    `MYSQL_HOST="${dbHost}"`,
    `MYSQL_PORT="${dbPort}"`,
    `MYSQL_USER="${dbUser}"`,
    `MYSQL_PASSWORD="${dbPass}"`,
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

  // pnpm exec means we use the project-local prisma binary, not a global one.
  // This avoids version mismatches.
  runLive("pnpm exec prisma generate", "Generating Prisma client...");
  ok("prisma generate");

  runLive("pnpm exec prisma db push", "Pushing schema to database...");
  ok("prisma db push");
}

// ---
// Build (dependencies + TypeScript + CSS)
// ---

function runBuild() {
  section("Build");

  runLive("pnpm install", "Installing dependencies...");
  ok("pnpm install");

  // TypeScript compilation - we continue even on type errors because many
  // projects ship with pre-existing warnings that don't affect runtime.
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

  // CSS - non-fatal; the app still loads if this fails, just without updated styles.
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
// Summary screen
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
    `  ${chalk.dim(`mysql://${creds.dbUser}:${creds.dbPass}@${creds.dbHost}:${creds.dbPort}/${creds.dbName}`)}`,
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
    warn("--skip-services: skipping Redis and MariaDB install/start.");
  } else {
    await ensureRedis();
    await ensureMariaDB();
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
