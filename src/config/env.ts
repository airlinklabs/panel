/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2025 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import fs from 'fs';
import path from 'path';
import logger from './logger';

// Required env vars that must be set for the panel to function.
// If any are missing after .env load, the panel exits immediately.
const REQUIRED_ENV_VARS = ['SESSION_SECRET', 'DATABASE_URL'];

// Optional vars from example.env — warn if not set, don't exit.
const EXAMPLE_ENV_PATH = path.resolve(process.cwd(), 'example.env');

export function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');

  try {
    const data = fs.readFileSync(envPath, 'utf8');

    data.split('\n').forEach((line) => {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');

      if (key) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    logger.error('Error loading .env file:', error);
  }

  // Fail-fast: ensure required env vars are set
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      console.error(`[env] FATAL: required env var ${key} is not set. Add it to .env`);
      process.exit(1);
    }
  }

  // Warn for optional vars defined in example.env
  try {
    const exampleData = fs.readFileSync(EXAMPLE_ENV_PATH, 'utf8');
    for (const line of exampleData.split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      if (key && !process.env[key]) {
        logger.warn(`[env] optional env var ${key} is not set (see example.env)`);
      }
    }
  } catch {
    // example.env is optional
  }
}
