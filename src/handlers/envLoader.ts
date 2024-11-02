import fs from 'fs';
import path from 'path';

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
        console.error(`Error loading .env file: ${(error as Error).message}`);
    }
}
