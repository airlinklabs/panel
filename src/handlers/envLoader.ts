
import fs from 'fs';
import path from 'path';
import logger from './logger';

// Required env vars that must be set for the panel to function.
// If any are missing after .env load, the panel exits immediately.
const REQUIRED_ENV_VARS = ['DATABASE_URL'];

// Optional vars from example.env — warn if not set, don't exit.
const EXAMPLE_ENV_PATH = path.resolve(process.cwd(), 'example.env');

/**
 * Pure parser: parse .env content into a key→value record.
 * Compatible with Node --env-file semantics (comments, quotes, blank lines).
 */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');

  // If .env doesn't exist, copy from example.env
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(EXAMPLE_ENV_PATH)) {
      try {
        fs.copyFileSync(EXAMPLE_ENV_PATH, envPath);
        logger.info('Created .env from example.env');
      } catch {
        logger.warn('Could not copy example.env to .env');
      }
    }
  }

  try {
    const data = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnv(data);
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }
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
