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
}
