#!/usr/bin/env node
/**
 * Operator-invoked secret setup: generates a strong SESSION_SECRET and
 * writes it into .env (creating the file from example.env if needed).
 *
 * Usage: node dist/cli/secret.js
 *
 * This is the ONLY place the panel writes a secret to .env — the runtime
 * never does. Run it once after deploying, then start the panel.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PANEL_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PANEL_ROOT, '.env');
const EXAMPLE_PATH = path.join(PANEL_ROOT, 'example.env');

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function ensureEnvFile(): void {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }
  if (fs.existsSync(EXAMPLE_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
    // eslint-disable-next-line no-console -- CLI tool, logger unavailable
    console.log(`Created .env from example.env (${ENV_PATH})`);
    return;
  }
  fs.writeFileSync(ENV_PATH, '');
  // eslint-disable-next-line no-console -- CLI tool, logger unavailable
  console.log(`Created empty .env (${ENV_PATH})`);
}

function setSecret(envPath: string, secret: string): void {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const keyRegex = /^SESSION_SECRET=.*/;
  let found = false;

  const out = lines.map((line) => {
    if (keyRegex.test(line)) {
      found = true;
      return `SESSION_SECRET="${secret}"`;
    }
    return line;
  });

  if (!found) {
    out.push(`SESSION_SECRET="${secret}"`);
  }

  fs.writeFileSync(envPath, `${out.join('\n').replace(/\n+$/, '\n')}\n`);
}

function main(): void {
  ensureEnvFile();
  const secret = generateSecret();
  setSecret(ENV_PATH, secret);

  // Keep the file readable only by the owner — it now holds a credential.
  try {
    fs.chmodSync(ENV_PATH, 0o600);
  } catch {
    // chmod may fail on some filesystems; not fatal.
  }

  // eslint-disable-next-line no-console -- CLI tool, logger unavailable
  console.log('Generated a new SESSION_SECRET and wrote it to .env');
  // eslint-disable-next-line no-console -- CLI tool, logger unavailable
  console.log(`  .env  -> ${ENV_PATH}`);
  // eslint-disable-next-line no-console -- CLI tool, logger unavailable
  console.log('Restart the panel for the new secret to take effect.');
}

main();
