import type express from 'express';
import logger from './logger';
import chalk from 'chalk';
import { registeredModules } from '../modules/registry';

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number,
  wsInstance?: { applyTo: (router: express.Router) => void },
) => {
  const modules = registeredModules();

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

  const panelMajor = airlinkVersion.split('.')[0];
  let loaded = 0;
  let errors = 0;

  for (const entry of modules) {
    const mod = entry.module;
    const modMajor = mod.info.version.split('.')[0];

    // Version compatibility is a hard contract: an incompatible module is a
    // misconfiguration that must surface at startup, not a silent skip.
    if (modMajor !== panelMajor) {
      errors++;
      logger.error(
        `[feature-registry] '${entry.name}' requires panel v${mod.info.version} (found v${airlinkVersion})`,
      );
      continue;
    }

    try {
      const router = mod.router(wsInstance ? (r: express.Router) => wsInstance.applyTo(r) : undefined);
      app.use(router);
      loaded++;
    } catch (error) {
      errors++;
      logger.error(`[feature-registry] Failed to mount '${entry.name}':`, error);
    }
  }

  console.log(padLine(`Loaded ${loaded} modules, errors ${errors}`));

  if (errors > 0) {
    logger.error(`[feature-registry] ${errors} module(s) failed to load`);
  }

  if (serverPort) {
    console.log(padLine(`Server running on http://localhost:${serverPort}`));
    console.log(border);
  }
};
