#!/usr/bin/env node

/**
 * start.mjs - panel launcher.
 *
 * Loads .env if present, then runs the compiled app.js.
 * Gracefully handles missing .env instead of crashing like --env-file would.
 *
 * Usage:
 *   node public/scripts/start.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---
// Paths
// ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");
const appPath = resolve(__dirname, "../../dist/app.js");

// ---
// Terminal helpers
// ---

const TTY = process.stdout.isTTY;
const C = {
  reset:  TTY ? "\x1b[0m"  : "",
  bold:   TTY ? "\x1b[1m"  : "",
  green:  TTY ? "\x1b[32m" : "",
  yellow: TTY ? "\x1b[33m" : "",
  red:    TTY ? "\x1b[31m" : "",
};

const ok   = (msg) => console.log(`  ${C.green}+${C.reset} ${msg}`);
const warn = (msg) => console.log(`  ${C.yellow}!${C.reset} ${C.yellow}${msg}${C.reset}`);
const fail = (msg) => console.log(`  ${C.red}x${C.reset} ${C.red}${msg}${C.reset}`);
const gap  = ()    => console.log();

function section(title) {
  gap();
  console.log(`${C.bold}${C.green}  ${title}${C.reset}`);
}

function banner() {
  gap();
  console.log(`${C.bold}  Airlink Panel${C.reset}`);
  gap();
}

// ---
// .env loading
// ---

function loadEnv() {
  if (!existsSync(envPath)) {
    warn(".env not found — using process.env only");
    return;
  }

  const lines = readFileSync(envPath, "utf-8").split("\n");
  let loaded = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Don't overwrite existing env vars (matches --env-file semantics)
    if (!process.env[key]) process.env[key] = value;
    loaded++;
  }

  ok(`Loaded ${loaded} variables from .env`);
}

// ---
// Entry point
// ---

function main() {
  banner();

  section("Environment");
  loadEnv();

  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  if (!existsSync(appPath)) {
    fail(`dist/app.js not found — run ${C.bold}pnpm run build${C.reset} first`);
    process.exit(1);
  }

  section("Starting");
  ok("Importing dist/app.js...");

  await import(appPath);
}

main();
