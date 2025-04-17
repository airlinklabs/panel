/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
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
      const [key, value] = line.split('=');

      if (key && value) {
        process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
      }
    });
  } catch (error) {
    logger.error('Error loading .env file:', error);
  }
}
