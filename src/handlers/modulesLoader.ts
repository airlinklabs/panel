/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import chalk from 'chalk';

type ModuleResult =
  | { file: string; mod: any }
  | { file: string; error: any };

// Check if debug mode is enabled
const isDebugMode = process.env.DEBUG === 'true';

// Basic ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

// Helper function to get a consistent timestamp
const getTimestamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Animated loading indicator that doesn't take up space
const startLoadingAnimation = (message: string): { stop: () => void } => {
  if (!isDebugMode) return { stop: () => {} };

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const intervalId = setInterval(() => {
    process.stdout.write(`\r${colors.cyan}${frames[i = ++i % frames.length]} ${message}${colors.reset}`);
  }, 80);

  return {
    stop: () => {
      clearInterval(intervalId);
      process.stdout.write('\r' + ' '.repeat(message.length + 2) + '\r');
    }
  };
};

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number
) => {
  const modulesDir = path.join(__dirname, '../modules');

  const getFilesRecursively = (dir: string): string[] => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = dirents.flatMap((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(fullPath) : fullPath;
    });
    return files.filter((file) => file.endsWith('.js') || file.endsWith('.ts'));
  };

  const files = getFilesRecursively(modulesDir);

// ASCII

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

const gradientSteps = ascii.length;
const getGradientColor = (index: number) => {
  const step = index / (gradientSteps - 5.2);
  const channel = Math.floor(255 - step * (255 - 204));
  const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
  return hex;
};

ascii.forEach((line, i) => {
  const color = getGradientColor(i);
  console.log(chalk.hex(color)(line));
});

// Boxed message
const boxWidth = 55;
const border = chalk.gray('+' + '-'.repeat(boxWidth) + '+');

// Helper function to pad content to fixed width
const padContent = (text: string): string => {
  const padding = ' '.repeat(Math.max(0, boxWidth - text.length));
  return chalk.greenBright('|') + chalk.whiteBright(text) + chalk.whiteBright(padding) + chalk.greenBright('|');
};

const content = padContent("Initializing - Loading core modules and components.");

console.log(border);
console.log(content);


  const modulePromises: Promise<ModuleResult>[] = files.map((file) =>
    import(file)
      .then((mod) => ({ file, mod }))
      .catch((error) => ({ file, error }))
  );

  const totalModules = modulePromises.length;
  logger.debug(`Found ${totalModules} modules to load`);

  const loader = startLoadingAnimation(`Loading modules (0/${totalModules})`);

  const modules = await Promise.all(modulePromises);
  let loadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Group modules by type for tracking
  const moduleGroups: Record<string, string[]> = {
    'Core': [],
    'Admin': [],
    'Auth': [],
    'API': [],
    'User': [],
    'Server': [],
    'Other': []
  };

  // Handle results
  for (const result of modules) {
    if ('error' in result) {
      logger.error(`Failed to load module ${result.file}:`, result.error);
      errorCount++;
      continue;
    }

    const module = result.mod?.default;
    if (module && module.info && typeof module.router === 'function') {
      const { info, router } = module;

      if (info.version === airlinkVersion) {
        // Determine module group
        let moduleGroup = 'Other';

        if (info.name.toLowerCase().includes('admin')) {
          moduleGroup = 'Admin';
        }
        if (info.name.toLowerCase().includes('auth')) {
          moduleGroup = 'Auth';
        }
        if (info.name.toLowerCase().includes('api')) {
          moduleGroup = 'API';
        }
        if (info.name.toLowerCase().includes('core')) {
          moduleGroup = 'Core';
        }
        if (info.name.toLowerCase().includes('player')) {
          moduleGroup = 'User';
        }
        if (info.name.toLowerCase().includes('user')) {
          moduleGroup = 'User';
        }
        if (info.name.toLowerCase().includes('server')) {
          moduleGroup = 'Server';
        }
        if (info.name.toLowerCase().includes('dashboard')) {
          moduleGroup = 'User';
        }

        // Add to appropriate group
        moduleGroups[moduleGroup].push(`${info.name}`);

        // Load module without verbose output
        app.use(router());
        loadedCount++;

        // Update loading animation
        if (isDebugMode) {
          process.stdout.write(`\r${colors.cyan}⠼ Loading modules (${loadedCount}/${totalModules})${colors.reset}`);
        }
      } else {
        logger.warn(
          `⚠️  Skipping incompatible module: ${info.name} (requires v${info.version}, found v${airlinkVersion})`,
        );
        skippedCount++;
      }
    } else {
      logger.warn(
        `⚠️  Invalid module structure in ${result.file}`,
      );
      errorCount++;
    }
  }

  // Stop the loading animation
  loader.stop();

  // Display detailed module info only in debug mode
  if (isDebugMode) {
    const moduleCountsByType = Object.entries(moduleGroups)
      .filter(([_, modules]) => modules.length > 0)
      .map(([group, modules]) => `${group}: ${modules.length}`);

    if (moduleCountsByType.length > 0) {
      logger.debug(`Modules loaded by type: ${moduleCountsByType.join(', ')}`);
    }
  }

  console.log(padContent(`Loaded ${loadedCount} modules, skipped ${skippedCount}, errors ${errorCount}`));

  // Add server running message if port is provided
  if (serverPort) {
    console.log(padContent(`Server running on http://localhost:${serverPort}`));
    console.log(border);
  }
};
