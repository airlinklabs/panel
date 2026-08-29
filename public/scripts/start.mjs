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
import chalk from "chalk";
import boxen from "boxen";

// ---
// Paths
// ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");
const appPath = resolve(__dirname, "../../dist/app.js");

const TTY = process.stdout.isTTY;

// ---
// Terminal helpers
// ---

const ok = (msg) => console.log(`  ${chalk.green("+")} ${msg}`);
const warn = (msg) =>
  console.log(`  ${chalk.yellow("!")} ${chalk.yellow(msg)}`);
const fail = (msg) => console.log(`  ${chalk.red("x")} ${chalk.red(msg)}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`  ${chalk.bold.green(title)}`);
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
      `  ${chalk.bold.cyan("Airlink Panel")} ${chalk.dim("v3.0")}`,
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
    console.log("  Airlink Panel");
  }

  section("Environment");
  loadEnv();

  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  if (!existsSync(appPath)) {
    fail(`dist/app.js not found — run ${chalk.bold("pnpm run build")} first`);
    process.exit(1);
  }

  section("Starting");
  ok("Importing dist/app.js...");

  import(appPath);
}

main();
