#!/usr/bin/env node
// scripts/build-vendor.mjs
// Generates public/javascript/vendor/* from locked node_modules packages.
// Run: node scripts/build-vendor.mjs
// CI: node scripts/build-vendor.mjs --check (exits 1 if files differ)
//
// NEVER hand-edit vendor files — the source of truth is the installed
// package versions in package.json / lockfile.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VENDOR = resolve(ROOT, 'public/javascript/vendor');
const check = process.argv.includes('--check');

function resolveDist(pkgName, relPath) {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, `node_modules/${pkgName}/package.json`), 'utf8'));
  const abs = resolve(ROOT, `node_modules/${pkgName}/${relPath}`);
  if (!existsSync(abs)) throw new Error(`Missing ${abs} — run npm install`);
  return { abs, version: pkg.version };
}

function copyDist(pkgName, relPath, outFile) {
  const { abs, version } = resolveDist(pkgName, relPath);
  const content = readFileSync(abs);
  if (check) {
    const current = readFileSync(outFile);
    if (!content.equals(current)) {
      console.error(`DRIFT: ${outFile} differs from ${pkgName}@${version}`);
      process.exit(1);
    }
    console.log(`  ${pkgName}@${version} → ${outFile} ✓`);
    return;
  }
  writeFileSync(outFile, content);
  console.log(`  ${pkgName}@${version} → ${outFile}`);
}

function buildQueryCore() {
  const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
  if (!existsSync(esbuildBin)) {
    console.error('esbuild not found — cannot build query-core vendor bundle');
    process.exit(1);
  }

  const entryFile = resolve(VENDOR, '.query-core-entry.js');
  const outTemp = resolve(VENDOR, '.query-core-out.js');

  writeFileSync(entryFile, `export { MutationCache, QueryCache, QueryClient, QueryObserver } from '@tanstack/query-core';\n`);

  try {
    execSync(
      `"${esbuildBin}" "${entryFile}" --bundle --outfile="${outTemp}" --format=iife --global-name=ALQuery --minify --log-level=error`,
      { cwd: ROOT, stdio: 'inherit' },
    );

    const generated = readFileSync(outTemp, 'utf8');
    const content = generated.replace(/^"use strict";/, '');
    const outFile = resolve(VENDOR, 'query-core.js');

    if (check) {
      const current = readFileSync(outFile, 'utf8');
      if (content !== current) {
        console.error('DRIFT: query-core.js differs from esbuild output');
        process.exit(1);
      }
      console.log('  @tanstack/query-core → query-core.js ✓');
    } else {
      writeFileSync(outFile, content);
      console.log('  @tanstack/query-core → query-core.js');
    }
  } finally {
    try { unlinkSync(entryFile); } catch { /* ok */ }
    try { unlinkSync(outTemp); } catch { /* ok */ }
  }
}

console.log('Building vendor bundles:');
copyDist('@hotwired/stimulus', 'dist/stimulus.umd.js', resolve(VENDOR, 'stimulus.js'));
copyDist('@hotwired/turbo', 'dist/turbo.es2017-umd.js', resolve(VENDOR, 'turbo.js'));
copyDist('reconnecting-websocket', 'dist/reconnecting-websocket-iife.min.js', resolve(VENDOR, 'reconnecting-websocket.js'));
buildQueryCore();
console.log(check ? 'All vendor bundles OK.' : 'Vendor bundles rebuilt.');
