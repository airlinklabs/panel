import type express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDebugMode = process.env.DEBUG === 'true';

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number,
  wsInstance?: { applyTo: (router: express.Router) => void },
) => {
  const { default: chalk } = await import('chalk');
  const modulesDir = path.join(__dirname, '../modules');

  const getFilesRecursively = (dir: string): string[] => {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(fullPath) : [fullPath];
    }).filter((f) => f.endsWith('.js') && !f.endsWith('.d.ts'));
  };

  const files = getFilesRecursively(modulesDir);

  const ascii = [
    '                                              ',
    '  /$$$$$$ /$$         /$$/$$         /$$      ',
    ' /$$__  $|__/        | $|__/        | $$      ',
    '| $$  \\ $$/$$ /$$$$$$| $$/$$/$$$$$$$| $$   /$$',
    '| $$$$$$$| $$/$$__  $| $| $| $$__  $| $$  /$$/',
    '| $$__  $| $| $$  \\__| $| $| $$  \\ $| $$$$$$/ ',
    '| $$  | $| $| $$     | $| $| $$  | $| $$_  $$ ',
    '| $$  | $| $| $$     | $| $| $$  | $| $$ \\  $$',
    '|__/  |__|__|__/     |__|__|__/  |__|__/  \\__/',
    '                                              ',
    '---Airlink Panel - By Airlinklabs MIT LICENSE---',
  ];

  ascii.forEach((line, i) => {
    const step = i / (ascii.length - 1);
    const channel = Math.floor(255 - step * 51);
    const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
    // eslint-disable-next-line no-console
    console.log(chalk.hex(hex)(line));
  });

  const boxWidth = 55;
  const border = chalk.gray('+' + '-'.repeat(boxWidth) + '+');
  const padLine = (text: string) => {
    const padding = ' '.repeat(Math.max(0, boxWidth - text.length));
    return chalk.greenBright('|') + chalk.whiteBright(text) + chalk.whiteBright(padding) + chalk.greenBright('|');
  };

  // eslint-disable-next-line no-console
  console.log(border);
  // eslint-disable-next-line no-console
  console.log(padLine('Initializing - Loading core modules and components.'));

  const results = await Promise.all(
    files.map((file) =>
      import(file)
        .then((mod) => ({ file, mod }))
        .catch((error) => ({ file, error })),
    ),
  );

  let loaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of results) {
    if ('error' in result) {
      logger.error(`Failed to load module ${result.file}:`, result.error);
      errors++;
      continue;
    }

    const mod = result.mod?.default;
    if (!mod?.info || typeof mod.router !== 'function') {
      if (isDebugMode) {logger.warn(`Skipping non-module file: ${result.file}`);}
      skipped++;
      continue;
    }

    if (mod.info.version !== airlinkVersion) {
      logger.warn(`Skipping incompatible module: ${mod.info.name} (requires v${mod.info.version}, found v${airlinkVersion})`);
      skipped++;
      continue;
    }

    const router = mod.router(wsInstance ? (r: express.Router) => { wsInstance.applyTo(r); } : undefined);
    app.use(router);
    loaded++;
  }

  // eslint-disable-next-line no-console
  console.log(padLine(`Loaded ${loaded} modules, skipped ${skipped}, errors ${errors}`));

  if (serverPort) {
    // eslint-disable-next-line no-console
    console.log(padLine(`Server running on http://localhost:${serverPort}`));
    // eslint-disable-next-line no-console
    console.log(border);
  }
};
