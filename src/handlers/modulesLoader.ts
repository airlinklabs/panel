import express from 'express';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import chalk from 'chalk';

type ModuleResult = { file: string; mod: any } | { file: string; error: any };

const isDebugMode = process.env.DEBUG === 'true';

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number,
) => {
  const modulesDir = path.join(__dirname, '../modules');

  const getFilesRecursively = (dir: string): string[] => {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(fullPath) : [fullPath];
    }).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));
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
  ];

  ascii.forEach((line, i) => {
    const step = i / (ascii.length - 1);
    const channel = Math.floor(255 - step * 51);
    const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
    console.log(chalk.hex(hex)(line));
  });

  const boxWidth = 55;
  const border = chalk.gray('+' + '-'.repeat(boxWidth) + '+');
  const padLine = (text: string) => {
    const padding = ' '.repeat(Math.max(0, boxWidth - text.length));
    return chalk.greenBright('|') + chalk.whiteBright(text) + chalk.whiteBright(padding) + chalk.greenBright('|');
  };

  console.log(border);
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
    if (!mod || !mod.info || typeof mod.router !== 'function') {
      if (isDebugMode) logger.warn(`Skipping non-module file: ${result.file}`);
      skipped++;
      continue;
    }

    if (mod.info.version !== airlinkVersion) {
      logger.warn(`Skipping incompatible module: ${mod.info.name} (requires v${mod.info.version}, found v${airlinkVersion})`);
      skipped++;
      continue;
    }

    app.use(mod.router());
    loaded++;
  }

  console.log(padLine(`Loaded ${loaded} modules, skipped ${skipped}, errors ${errors}`));

  if (serverPort) {
    console.log(padLine(`Server running on http://localhost:${serverPort}`));
    console.log(border);
  }
};
