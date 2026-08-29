#!/usr/bin/env node

/**
 * build-vendor.mjs - generates public/javascript/vendor/* from node_modules.
 *
 * What it does:
 *   1. Copies htmx.min.js, alpine.min.js, reconnecting-websocket.js from
 *      their installed package dist folders.
 *   2. Bundles @tanstack/query-core into a single IIFE via esbuild.
 *
 * Flags:
 *   --check   Verify vendor files are up-to-date without writing (for CI).
 *
 * Usage:
 *   node public/scripts/build-vendor.mjs
 *   node public/scripts/build-vendor.mjs --check
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
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
// Terminal helpers (subset of setup.mjs colours)
// ---

const TTY = process.stdout.isTTY;
const C = {
  reset: TTY ? "\x1b[0m" : "",
  bold: TTY ? "\x1b[1m" : "",
  dim: TTY ? "\x1b[2m" : "",
  green: TTY ? "\x1b[32m" : "",
  yellow: TTY ? "\x1b[33m" : "",
  red: TTY ? "\x1b[31m" : "",
};

const ok = (msg) => console.log(`  ${C.green}+${C.reset} ${msg}`);
const warn = (msg) =>
  console.log(`  ${C.yellow}!${C.reset} ${C.yellow}${msg}${C.reset}`);
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
// Helpers
// ---

/** Read a package's dist file and return its contents + version. */
function resolveDist(pkgName, relPath) {
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, `node_modules/${pkgName}/package.json`), "utf8"),
  );
  const abs = resolve(ROOT, `node_modules/${pkgName}/${relPath}`);
  if (!existsSync(abs)) throw new Error(`Missing ${abs} — run pnpm install`);
  return { abs, version: pkg.version };
}

/** Copy a package dist file into the vendor directory. */
function copyDist(pkgName, relPath, outFile) {
  const { abs, version } = resolveDist(pkgName, relPath);
  const content = readFileSync(abs);

  if (check) {
    const current = readFileSync(outFile);
    if (!content.equals(current)) {
      fail(`${pkgName}@${version} → ${outFile} differs from source`);
      process.exit(1);
    }
    ok(`${pkgName}@${version} → ${outFile} ✓`);
    return;
  }

  writeFileSync(outFile, content);
  ok(`${pkgName}@${version} → ${outFile}`);
}

/** Bundle @tanstack/query-core into a single IIFE via esbuild. */
function buildQueryCore() {
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

    const generated = readFileSync(outTemp, "utf8");
    const content = generated.replace(/^"use strict";/, "");
    const outFile = resolve(VENDOR, "query-core.js");

    if (check) {
      const current = readFileSync(outFile, "utf8");
      if (content !== current) {
        fail("@tanstack/query-core → query-core.js differs from source");
        process.exit(1);
      }
      ok("@tanstack/query-core → query-core.js ✓");
    } else {
      writeFileSync(outFile, content);
      ok("@tanstack/query-core → query-core.js");
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

  copyDist("htmx.org", "dist/htmx.min.js", resolve(VENDOR, "htmx.min.js"));
  copyDist("alpinejs", "dist/cdn.min.js", resolve(VENDOR, "alpine.min.js"));
  copyDist(
    "reconnecting-websocket",
    "dist/reconnecting-websocket-iife.min.js",
    resolve(VENDOR, "reconnecting-websocket.js"),
  );
  buildQueryCore();

  gap();
  ok(check ? "All vendor bundles OK." : "Vendor bundles rebuilt.");
  gap();
}

main();
