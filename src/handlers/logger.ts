/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2025 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { createConsola, ConsolaInstance } from 'consola';
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgWhite: '\x1b[47m',
};

const isDebugMode = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

const consola = createConsola({
  level: isDebugMode ? 4 : 3,
  fancy: true,
  formatOptions: {
    date: false,
    colors: true,
    compact: process.env.NODE_ENV === 'production',
  },
}) as ConsolaInstance;

consola.wrapConsole();
consola.wrapAll();

const writeToLogFile = (level: string, message: string): void => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${message}\n`;
  fs.appendFile(path.join(logsDir, 'combined.log'), logMessage, (err) => {
    if (err) consola.error('Failed to write to combined log file:', err);
  });
};

const getTimestamp = (): string => {
  const now = new Date();
  return [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join(':');
};

const formatLogMessage = (badge: string, message: string, maxWidth = 120): string => {
  const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
  const padding = ' '.repeat(Math.max(0, maxWidth - (badge.length + message.length + timestamp.length)));
  return `${badge} ${message}${padding}${timestamp}`;
};

const logger = {
  error(message: string, error?: unknown): void {
    const badge = `${colors.bgRed}${colors.white}${colors.bright} ERROR ${colors.reset}`;

    if (error instanceof Error) {
      consola.error(formatLogMessage(badge, message), error);
    } else {
      consola.error(formatLogMessage(badge, `${message}: ${error}`));
    }

    const timestamp = new Date().toISOString();
    fs.appendFile(path.join(logsDir, 'error.log'), `[${timestamp}] ERROR: ${message}: ${error}\n`, (err) => {
      if (err) consola.error('Failed to write to error log file:', err);
    });
  },

  warn(message: any): void {
    const badge = `${colors.bgYellow}${colors.white}${colors.bright} WARN ${colors.reset}`;
    consola.warn(formatLogMessage(badge, String(message)));
    writeToLogFile('WARN', String(message));
  },

  info(message: any): void {
    const badge = `${colors.bgBlue}${colors.white}${colors.bright} INFO ${colors.reset}`;
    consola.info(formatLogMessage(badge, `${colors.blue}${message}${colors.reset}`));
    writeToLogFile('INFO', String(message));
  },

  success(message: any): void {
    const badge = `${colors.bgGreen}${colors.white}${colors.bright} SUCCESS ${colors.reset}`;
    consola.success(formatLogMessage(badge, String(message)));
    writeToLogFile('SUCCESS', String(message));
  },

  debug(message: any, ...args: any[]): void {
    if (!isDebugMode) return;

    const badge = `${colors.bgMagenta}${colors.white}${colors.bright} DEBUG ${colors.reset}`;
    const formatted = formatLogMessage(badge, String(message));

    if (args.length > 0) {
      consola.debug(formatted, ...args);
    } else {
      consola.debug(formatted);
    }

    writeToLogFile('DEBUG', [message, ...args].map(String).join(' '));
  },

  log(message: any, ...args: any[]): void {
    const badge = `${colors.bgWhite}${colors.white}${colors.bright} LOG ${colors.reset}`;
    const formatted = formatLogMessage(badge, String(message));

    if (args.length > 0) {
      consola.log(formatted, ...args);
    } else {
      consola.log(formatted);
    }

    writeToLogFile('LOG', [message, ...args].map(String).join(' '));
  },

  box(options: string | { title?: string; message: string | string[]; style?: any }): void {
    if (typeof options === 'string') {
      this.info(options);
      writeToLogFile('BOX', options);
      return;
    }

    const title = options.title || '';
    const messages = Array.isArray(options.message) ? options.message : [options.message];
    const text = title ? `${title}: ${messages.join(' | ')}` : messages.join(' | ');

    this.info(text);
    writeToLogFile('BOX', text);
  },
};

export default logger;
