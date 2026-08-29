#!/usr/bin/env node

/**
 * build-vendor.mjs - bundles @tanstack/query-core into a single IIFE.
 *
 * Other vendor dependencies (htmx, alpine, xterm, chart.js, etc.) are served
 * directly from node_modules via the Express /vendor/ static mount.
 *
 * Flags:
 *   --check   Verify vendor files are up-to-date without writing (for CI).
 *
 * Usage:
 *   node public/scripts/build-vendor.mjs
 *   node public/scripts/build-vendor.mjs --check
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---
// Paths
// ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const VENDOR = resolve(ROOT, "public/javascript/vendor");
const check = process.argv.includes("--check");

// ---
// Terminal helpers
// ---

const TTY = process.stdout.isTTY;
const C = {
  reset: TTY ? "\x1b[0m" : "",
  bold: TTY ? "\x1b[1m" : "",
  green: TTY ? "\x1b[32m" : "",
  yellow: TTY ? "\x1b[33m" : "",
  red: TTY ? "\x1b[31m" : "",
};

const ok = (msg) => console.log(`  ${C.green}+${C.reset} ${msg}`);
const fail = (msg) =>
  console.log(`  ${C.red}x${C.reset} ${C.red}${msg}${C.reset}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`${C.bold}${C.green}  ${title}${C.reset}`);
}

function banner() {
  gap();
  console.log(`${C.bold}  build-vendor${C.reset}`);
  gap();
}

// ---
// Bundle @tanstack/query-core into a single IIFE via esbuild
// ---

function buildQueryCore() {
  mkdirSync(VENDOR, { recursive: true });

  const esbuildBin = resolve(ROOT, "node_modules/.bin/esbuild");
  if (!existsSync(esbuildBin)) {
    fail("esbuild not found — cannot build query-core vendor bundle");
    process.exit(1);
  }

  const entryFile = resolve(VENDOR, ".query-core-entry.js");
  const outTemp = resolve(VENDOR, ".query-core-out.js");

  writeFileSync(
    entryFile,
    `export { MutationCache, QueryCache, QueryClient, QueryObserver } from '@tanstack/query-core';\n`,
  );

  try {
    execSync(
      `"${esbuildBin}" "${entryFile}" --bundle --outfile="${outTemp}" --format=iife --global-name=ALQuery --minify --log-level=error`,
      { cwd: ROOT, stdio: "inherit" },
    );

    const pkg = JSON.parse(
      readFileSync(
        resolve(ROOT, "node_modules/@tanstack/query-core/package.json"),
        "utf8",
      ),
    );
    const generated = readFileSync(outTemp, "utf8");
    const content = generated.replace(/^"use strict";/, "");
    const outFile = resolve(VENDOR, "query-core.js");

    if (check) {
      const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
      if (content !== current) {
        fail("@tanstack/query-core → query-core.js differs from source");
        process.exit(1);
      }
      ok(`@tanstack/query-core@${pkg.version} → query-core.js ✓`);
    } else {
      writeFileSync(outFile, content);
      ok(`@tanstack/query-core@${pkg.version} → query-core.js`);
    }
  } finally {
    try {
      unlinkSync(entryFile);
    } catch {}
    try {
      unlinkSync(outTemp);
    } catch {}
  }
}

// ---
// Entry point
// ---

function main() {
  banner();
  section("Vendor bundles");

  buildQueryCore();

  gap();
  ok(
    check
      ? "Vendor bundle OK."
      : "Vendor bundle rebuilt. Other deps served from node_modules via /vendor/.",
  );
  gap();
}

main();
