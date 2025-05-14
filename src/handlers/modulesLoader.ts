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

type ModuleResult =
  | { file: string; mod: any }
  | { file: string; error: any };

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
};

// Helper function to get a consistent timestamp
const getTimestamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
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

  // Show startup banner
  const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
  const padding = ' '.repeat(Math.max(0, 100 - 56 - timestamp.length));
  
  console.log(`
${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════════════╗${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║                                                              ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.magenta} █████  ██ ██████  ██      ██ ███    ██ ██   ██ ${colors.cyan}            ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.magenta}██   ██ ██ ██   ██ ██      ██ ████   ██ ██  ██  ${colors.cyan}            ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.magenta}███████ ██ ██████  ██      ██ ██ ██  ██ █████   ${colors.cyan}            ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.magenta}██   ██ ██ ██   ██ ██      ██ ██  ██ ██ ██  ██  ${colors.cyan}            ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.magenta}██   ██ ██ ██   ██ ███████ ██ ██   ████ ██   ██ ${colors.cyan}            ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║                                                              ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║  ${colors.green}Starting AirLink Panel - Open Source Game Server Management${colors.cyan} ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}║                                                              ║${colors.reset}${padding}${timestamp}
${colors.cyan}${colors.bright}╚══════════════════════════════════════════════════════════════╝${colors.reset}${padding}${timestamp}
`);

  logger.box({
    title: '🚀 Initializing',
    message: 'Loading core modules and components...',
    style: { 
      borderColor: 'cyan',
      titleColor: 'blue',
      padding: 1
    }
  });

  const modulePromises: Promise<ModuleResult>[] = files.map((file) =>
    import(file)
      .then((mod) => ({ file, mod }))
      .catch((error) => ({ file, error }))
  );

  const totalModules = modulePromises.length;
  console.log(`${colors.dim}Found ${totalModules} potential modules to load${colors.reset}`);

  const modules = await Promise.all(modulePromises);
  let loadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Group modules by type for organized display
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
        // Get module type emoji
        let typeEmoji = '📦';
        let moduleGroup = 'Other';
        
        if (info.name.toLowerCase().includes('admin')) {
          typeEmoji = '⚡';
          moduleGroup = 'Admin';
        }
        if (info.name.toLowerCase().includes('auth')) {
          typeEmoji = '🔒';
          moduleGroup = 'Auth';
        }
        if (info.name.toLowerCase().includes('api')) {
          typeEmoji = '🔌';
          moduleGroup = 'API';
        }
        if (info.name.toLowerCase().includes('core')) {
          typeEmoji = '🎯';
          moduleGroup = 'Core';
        }
        if (info.name.toLowerCase().includes('player')) {
          typeEmoji = '👥';
          moduleGroup = 'User';
        }
        if (info.name.toLowerCase().includes('user')) {
          typeEmoji = '👤';
          moduleGroup = 'User';
        }
        if (info.name.toLowerCase().includes('server')) {
          typeEmoji = '🖥️';
          moduleGroup = 'Server';
        }
        if (info.name.toLowerCase().includes('dashboard')) {
          typeEmoji = '📊';
          moduleGroup = 'User';
        }

        // Add to appropriate group
        moduleGroups[moduleGroup].push(`${typeEmoji}  ${info.name} v${info.moduleVersion}`);
        
        // Show progress and load module
        const progress = Math.round((loadedCount / totalModules) * 100);
        const progressBar = createProgressBar(progress);
        
        // Format with consistent timestamp
        const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
        const padding = ' '.repeat(Math.max(0, 100 - progressBar.length - 20 - timestamp.length));
        
        process.stdout.write(`\r${colors.dim}Loading modules: ${progressBar} ${progress}%${colors.reset}${padding}${timestamp}`);
        
        app.use(router());
        loadedCount++;
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

  // Clear progress line and add newline
  process.stdout.write('\n\n');

  // Display modules by category
  for (const [group, modules] of Object.entries(moduleGroups)) {
    if (modules.length > 0) {
      // Format with consistent timestamp
      const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
      const headerPadding = ' '.repeat(Math.max(0, 100 - group.length - 20 - timestamp.length));
      
      console.log(`${colors.bright}${colors.cyan}▌${colors.reset} ${colors.bright}${group} Modules:${colors.reset}${headerPadding}${timestamp}`);
      
      modules.forEach(module => {
        const modulePadding = ' '.repeat(Math.max(0, 100 - module.length - 4 - timestamp.length));
        console.log(`  ${module}${modulePadding}${timestamp}`);
      });
      
      console.log(''); // Add a blank line between groups
    }
  }

  // Summary box
  logger.box({
    title: '📊 Module Loading Summary',
    message: [
      `✅ Successfully loaded: ${loadedCount} modules`,
      `⚠️  Skipped: ${skippedCount} modules`,
      `❌ Errors: ${errorCount} modules`,
    ],
    style: {
      borderColor: 'green',
      titleColor: 'green'
    }
  });
};

// Helper function to create a progress bar
function createProgressBar(percentage: number, length = 30): string {
  const filled = Math.round(length * (percentage / 100));
  const empty = length - filled;
  
  const filledBar = colors.green + '█'.repeat(filled);
  const emptyBar = colors.dim + '░'.repeat(empty);
  
  return `${filledBar}${emptyBar}${colors.reset}`;
}
