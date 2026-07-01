#!/usr/bin/env node

/**
 * Airlink Panel - Build & Setup Script
 *
 * Handles all project lifecycle commands:
 *   node public/setup.mjs setup       Full project setup
 *   node public/setup.mjs build       Build frontend + backend
 *   node public/setup.mjs dev         Run dev (backend + frontend)
 *   node public/setup.mjs dev:backend Backend only
 *   node public/setup.mjs dev:frontend Frontend only
 *   node public/setup.mjs start       Production start
 *   node public/setup.mjs migrate:dev Run prisma migrate dev
 *   node public/setup.mjs migrate:deploy Run prisma migrate deploy
 *   node public/setup.mjs typecheck   TypeScript check
 *   node public/setup.mjs lint        ESLint
 *   node public/setup.mjs format      Prettier
 *   node public/setup.mjs db:push     Prisma db push
 *   node public/setup.mjs db:reset    Reset database
 *
 * Without arguments, launches an interactive TUI menu.
 */

import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const FRONTEND = join(ROOT, "frontend");

// ── Logger ────────────────────────────────────────────────────────────────────

const LOGS_DIR = join(ROOT, "logs");
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

const LOG_FILE = join(LOGS_DIR, "setup.log");
const logStream = writeFileSync(LOG_FILE, `[${new Date().toISOString()}] setup.mjs started\n`);

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const clean = msg.replace(/\x1b\[[0-9;]*m/g, "");
  appendFileSync(LOG_FILE, `[${ts}] ${clean}\n`);
}

// ── Colors ────────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`${c.cyan}  >${c.reset} ${c.dim}${cmd}${c.reset}`);
  log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: opts.cwd || ROOT, ...opts });
    log(`OK: ${cmd}`);
    return true;
  } catch {
    console.error(`${c.red}  ✗ Failed:${c.reset} ${cmd}`);
    log(`FAIL: ${cmd}`);
    return false;
  }
}

function runQuiet(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf-8", cwd: opts.cwd || ROOT, ...opts }).trim();
  } catch {
    return null;
  }
}

function step(n, total, label) {
  const dots = Array.from({ length: total }, (_, i) =>
    i < n ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`
  ).join(" ");
  console.log(`${dots}  ${c.bold}${label}${c.reset}`);
  log(`Step ${n}/${total}: ${label}`);
}

function success(msg) {
  console.log(`${c.green}  ✓ ${msg}${c.reset}`);
  log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`${c.red}  ✗ ${msg}${c.reset}`);
  log(`✗ ${msg}`);
}

function ensureEnv() {
  if (existsSync(join(ROOT, ".env"))) return;
  console.log(`${c.yellow}  ⚠ No .env found. Creating from example.env...${c.reset}`);
  if (!existsSync(join(ROOT, "example.env"))) {
    fail("No example.env found. Cannot create .env.");
    process.exit(1);
  }
  let env = readFileSync(join(ROOT, "example.env"), "utf-8");
  const secret = runQuiet("openssl rand -hex 32") || "dev-only-insecure-secret-change-me";
  env = env.replace(/SESSION_SECRET=.*/, `SESSION_SECRET="${secret}"`);
  writeFileSync(join(ROOT, ".env"), env);
  success("Created .env with random SESSION_SECRET.");
}

function ensureStorage() {
  const d = join(ROOT, "storage");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function getScript() {
  return process.argv[2] || "help";
}

function pause() {
  return new Promise((r) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${c.dim}  Press Enter to continue...${c.reset}`, () => { rl.close(); r(); });
  });
}

function askConfirm(msg) {
  return new Promise((r) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${c.yellow}  ⚠ ${msg} (y/N): ${c.reset}`, (a) => { rl.close(); r(a === "y" || a === "yes"); });
  });
}

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function setCursor(v) {
  process.stdout.write(v ? "\x1b[?25h" : "\x1b[?25l");
}

// ── Commands ──────────────────────────────────────────────────────────────────

const commands = {
  async setup() {
    clear();
    console.log(`\n${c.bold}${c.magenta}  Airlink Panel — Setup${c.reset}\n`);
    ensureStorage();
    ensureEnv();

    step(1, 5, "Installing dependencies");
    run("pnpm install --ignore-scripts");
    run("cd frontend && npm install --ignore-scripts", { cwd: ROOT });
    success("Dependencies installed\n");

    step(2, 5, "Generating Prisma client");
    run("npx prisma generate");
    success("Prisma client generated\n");

    step(3, 5, "Pushing database schema");
    run("npx prisma db push");
    success("Schema pushed\n");

    step(4, 5, "Building backend");
    if (!run("npx tsc")) process.exit(1);
    if (!run("npx tsc -p tsconfig.prisma.json")) process.exit(1);
    if (!run("npx tailwindcss -i ./public/tw.css -o ./public/styles.css")) process.exit(1);
    success("Backend built\n");

    step(5, 5, "Building frontend");
    if (!run("cd frontend && npx vite build", { cwd: ROOT })) process.exit(1);
    success("Frontend built\n");

    console.log(`${c.green}${c.bold}  Setup complete!${c.reset}\n`);
    console.log(`  ${c.dim}Run ${c.cyan}node public/setup.mjs start${c.dim} for production${c.reset}`);
    console.log(`  ${c.dim}Run ${c.cyan}node public/setup.mjs dev${c.dim} for development${c.reset}\n`);
  },

  async build() {
    clear();
    console.log(`\n${c.bold}${c.blue}  Airlink Panel — Build${c.reset}\n`);
    ensureEnv();

    step(1, 2, "Backend (TypeScript + Prisma + Tailwind)");
    if (!run("npx tsc")) process.exit(1);
    if (!run("npx tsc -p tsconfig.prisma.json")) process.exit(1);
    if (!run("npx tailwindcss -i ./public/tw.css -o ./public/styles.css")) process.exit(1);
    success("Backend built\n");

    step(2, 2, "Frontend (Vite + React)");
    if (!run("cd frontend && npx vite build", { cwd: ROOT })) process.exit(1);
    success("Frontend built\n");

    console.log(`${c.green}${c.bold}  Build complete!${c.reset}\n`);
  },

  async dev() {
    clear();
    console.log(`\n${c.bold}${c.green}  Airlink Panel — Dev Mode${c.reset}\n`);
    ensureStorage();
    ensureEnv();

    run("npx prisma generate");
    run("npx prisma migrate deploy");

    console.log(`${c.green}  ●${c.reset} Backend  ${c.dim}(nodemon)${c.reset}`);
    console.log(`${c.blue}  ●${c.reset} Frontend ${c.dim}(vite)${c.reset}\n`);

    const backend = spawn("npx", ["nodemon"], { cwd: ROOT, stdio: "inherit", shell: true });
    const frontend = spawn("npx", ["vite"], { cwd: FRONTEND, stdio: "inherit", shell: true });

    const shutdown = () => {
      backend.kill("SIGTERM");
      frontend.kill("SIGTERM");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    backend.on("close", shutdown);
    frontend.on("close", shutdown);
  },

  async "dev:backend"() {
    ensureStorage();
    ensureEnv();
    run("npx prisma generate");
    run("npx prisma migrate deploy");
    run("npx nodemon");
  },

  async "dev:frontend"() {
    run("cd frontend && npx vite", { cwd: ROOT });
  },

  async start() {
    clear();
    ensureEnv();

    if (!existsSync(join(ROOT, "dist", "app.js"))) {
      fail("Backend not built. Run: node public/setup.mjs build");
      process.exit(1);
    }
    if (!existsSync(join(FRONTEND, "dist", "index.html"))) {
      fail("Frontend not built. Run: node public/setup.mjs build");
      process.exit(1);
    }

    console.log(`\n${c.bold}${c.cyan}  Airlink Panel — Production${c.reset}`);
    console.log(`${c.cyan}  ●${c.reset} Starting server...\n`);
    execSync("node dist/app.js", { cwd: ROOT, stdio: "inherit" });
  },

  async "migrate:dev"() {
    run("npx prisma migrate dev");
  },

  async "migrate:deploy"() {
    run("npx prisma migrate deploy");
    run("npx prisma generate");
  },

  async "db:push"() {
    run("npx prisma db push");
  },

  async "db:reset"() {
    const ok = await askConfirm("This will delete ALL data in the database. Continue?");
    if (ok) {
      run("npx prisma migrate reset --force");
    } else {
      console.log(`${c.yellow}  Aborted.${c.reset}`);
    }
  },

  async typecheck() {
    const backend = run("npx tsc --noEmit");
    const frontend = run("cd frontend && npx tsc --noEmit", { cwd: ROOT });
    if (!backend || !frontend) process.exit(1);
  },

  async "typecheck:frontend"() {
    if (!run("cd frontend && npx tsc --noEmit", { cwd: ROOT })) process.exit(1);
  },

  async lint() {
    run("npx eslint src --fix");
  },

  async format() {
    run("npx prettier --write src/");
  },

  async help() {
    clear();
    console.log(`
${c.bold}${c.magenta}  Airlink Panel — Setup Script${c.reset}

${c.bold}  Usage:${c.reset}
    ${c.cyan}node public/setup.mjs <command>${c.reset}

${c.bold}  Commands:${c.reset}
    ${c.green}setup${c.reset}             Full project setup (deps + db + build)
    ${c.green}build${c.reset}             Build frontend + backend
    ${c.green}dev${c.reset}               Run dev mode (backend + frontend)
    ${c.green}dev:backend${c.reset}       Backend only dev mode
    ${c.green}dev:frontend${c.reset}      Frontend only dev mode
    ${c.green}start${c.reset}             Production start
    ${c.green}migrate:dev${c.reset}       Prisma migrate dev
    ${c.green}migrate:deploy${c.reset}    Prisma migrate deploy
    ${c.green}db:push${c.reset}           Prisma db push
    ${c.green}db:reset${c.reset}          Reset database (destructive)
    ${c.green}typecheck${c.reset}         TypeScript check (all)
    ${c.green}typecheck:frontend${c.reset}  TypeScript check (frontend only)
    ${c.green}lint${c.reset}              ESLint
    ${c.green}format${c.reset}            Prettier
    ${c.green}help${c.reset}              Show this message

${c.dim}  Logs saved to logs/setup.log${c.reset}
`);
  },
};

// ── TUI Menu ──────────────────────────────────────────────────────────────────

const menu = [
  { key: "setup",           label: "Setup",         desc: "Full project setup",           icon: "⚙", color: c.magenta },
  { key: "dev",             label: "Dev Mode",      desc: "Run dev mode",                 icon: "▶", color: c.green },
  { key: "build",           label: "Build",         desc: "Build frontend + backend",     icon: "🔨", color: c.blue },
  { key: "start",           label: "Start",         desc: "Production start",             icon: "🚀", color: c.cyan },
  { key: "db:push",         label: "DB Push",       desc: "Push database schema",         icon: "📦", color: c.yellow },
  { key: "db:reset",        label: "DB Reset",      desc: "Reset database (destructive)", icon: "⚠", color: c.red },
  { key: "migrate:dev",     label: "Migrate Dev",   desc: "Prisma migrate dev",           icon: "↻", color: c.green },
  { key: "migrate:deploy",  label: "Migrate Deploy", desc: "Prisma migrate deploy",       icon: "↑", color: c.blue },
  { key: "typecheck",       label: "Typecheck",     desc: "TypeScript check",             icon: "✓", color: c.cyan },
  { key: "lint",            label: "Lint",          desc: "ESLint",                       icon: "🔍", color: c.yellow },
  { key: "format",          label: "Format",        desc: "Prettier",                     icon: "✏", color: c.magenta },
  { key: "help",            label: "Help",          desc: "Show help",                    icon: "?", color: c.gray },
];

async function runTUI() {
  let sel = 0;
  setCursor(false);

  const render = () => {
    clear();
    console.log(`\n${c.bold}${c.magenta}  Airlink Panel — Setup${c.reset}\n`);
    console.log(`${c.dim}  ↑/↓ navigate  Enter select  q quit${c.reset}\n`);

    for (let i = 0; i < menu.length; i++) {
      const m = menu[i];
      const active = i === sel;
      const ptr = active ? `${m.color}${c.bold}  ▸${c.reset}` : `${c.dim}    ${c.reset}`;
      const lbl = active ? `${m.color}${c.bold}${m.icon}  ${m.label}${c.reset}` : `${c.white}  ${m.icon}  ${m.label}${c.reset}`;
      const desc = active ? `  ${c.dim}${m.desc}${c.reset}` : "";
      console.log(`${ptr} ${lbl}${desc}`);
    }

    console.log(`\n${c.dim}  Logs: logs/setup.log${c.reset}\n`);
  };

  render();

  return new Promise((r) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on("keypress", (_, key) => {
      if (key.name === "up" || key.name === "k") { sel = (sel - 1 + menu.length) % menu.length; render(); }
      else if (key.name === "down" || key.name === "j") { sel = (sel + 1) % menu.length; render(); }
      else if (key.name === "return") { setCursor(true); process.stdin.setRawMode(false); process.stdin.removeAllListeners("keypress"); r(menu[sel].key); }
      else if (key.name === "q" || (key.ctrl && key.name === "c")) { setCursor(true); process.stdin.setRawMode(false); process.exit(0); }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const cmd = getScript();

if (cmd === "help" && process.argv.length <= 2 && process.stdin.isTTY) {
  const selected = await runTUI();
  if (commands[selected]) await commands[selected]();
} else if (commands[cmd]) {
  await commands[cmd]();
} else {
  console.error(`${c.red}  ✗ Unknown command: ${c.reset}${cmd}`);
  await commands.help();
  process.exit(1);
}
