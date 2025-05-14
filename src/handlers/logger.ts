/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { createConsola, ConsolaInstance } from 'consola';
import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Check if debug mode is enabled
const isDebugMode = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

// Disable consola's default date formatting as we'll handle it ourselves
const consola = createConsola({
  level: isDebugMode ? 4 : 3,
  fancy: true,
  formatOptions: {
    date: false, // Disable default date formatting
    colors: true,
    compact: process.env.NODE_ENV === 'production',
  },
}) as ConsolaInstance;

// Wrap console to redirect all console.* calls to consola
consola.wrapConsole();

// Wrap process stdout/stderr
consola.wrapAll();

// Helper function to write to log files
const writeToLogFile = (level: string, message: string): void => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${message}\n`;
  fs.appendFile(path.join(logsDir, 'combined.log'), logMessage, (err) => {
    if (err) consola.error('Failed to write to combined log file:', err);
  });
};

// Format timestamp consistently
const getTimestamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Format message with fixed width columns and timestamp
const formatLogMessage = (badge: string, message: string, maxWidth = 120): string => {
  const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
  const padding = ' '.repeat(Math.max(0, maxWidth - (badge.length + message.length + timestamp.length)));

  return `${badge} ${message}${padding}${timestamp}`;
};

// Create a logger interface that matches the existing API
const logger = {
  error(message: string, error?: unknown): void {
    const badge = `${colors.bgRed}${colors.white}${colors.bright} ERROR ${colors.reset}`;

    if (error instanceof Error) {
      const formattedMessage = formatLogMessage(badge, message);
      consola.error(formattedMessage, error);
    } else {
      const formattedMessage = formatLogMessage(badge, `${message}: ${error}`);
      consola.error(formattedMessage);
    }

    // Write to error log file
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}: ${error}\n`;
    fs.appendFile(path.join(logsDir, 'error.log'), logMessage, (err) => {
      if (err) consola.error('Failed to write to error log file:', err);
    });
  },

  warn(message: any): void {
    const badge = `${colors.bgYellow}${colors.black}${colors.bright} WARN ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, message);
    consola.warn(formattedMessage);

    // Write to combined log file
    writeToLogFile('WARN', String(message));
  },

  info(message: any): void {
    // Set color based on message content for better visual feedback
    let color = colors.blue;

    if (message.toLowerCase().includes('database')) {
      color = colors.green;
    }
    if (message.toLowerCase().includes('server')) {
      color = colors.magenta;
    }
    if (message.toLowerCase().includes('loading')) {
      color = colors.cyan;
    }
    if (message.toLowerCase().includes('started')) {
      color = colors.green;
    }
    if (message.toLowerCase().includes('connected')) {
      color = colors.green;
    }
    if (message.toLowerCase().includes('created')) {
      color = colors.green;
    }
    if (message.toLowerCase().includes('stats')) {
      color = colors.yellow;
    }
    if (message.toLowerCase().includes('addon')) {
      color = colors.magenta;
    }
    if (message.toLowerCase().includes('player')) {
      color = colors.cyan;
    }

    const badge = `${colors.bgBlue}${colors.white}${colors.bright} INFO ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, `${color}${message}${colors.reset}`);
    consola.info(formattedMessage);

    // Write to combined log file
    writeToLogFile('INFO', String(message));
  },

  success(message: any): void {
    const badge = `${colors.bgGreen}${colors.black}${colors.bright} SUCCESS ${colors.reset}`;
    const formattedMessage = formatLogMessage(badge, `${message}`);
    consola.success(formattedMessage);

    // Write to combined log file
    writeToLogFile('SUCCESS', String(message));
  },

  debug(message: any, ...args: any[]): void {
    if (isDebugMode) {
      const badge = `${colors.bgMagenta}${colors.white}${colors.bright} DEBUG ${colors.reset}`;

      if (args.length > 0) {
        const formattedMessage = formatLogMessage(badge, `⚙ ${message}`);
        consola.debug(formattedMessage, ...args);
      } else {
        const formattedMessage = formatLogMessage(badge, `⚙ ${message}`);
        consola.debug(formattedMessage);
      }

      // Write to combined log file
      writeToLogFile('DEBUG', [message, ...args].map(arg => String(arg)).join(' '));
    }
  },

  log(message: any, ...args: any[]): void {
    // Add box formatting for important messages
    if (typeof message === 'string' &&
       (message.toLowerCase().includes('started') ||
        message.toLowerCase().includes('ready') ||
        message.toLowerCase().includes('listening'))) {
      this.box({
        title: '🚀 Server Status',
        message: `${message} ${args.join(' ')}`,
        style: {
          padding: 1,
          borderColor: 'green',
          titleColor: 'green'
        }
      });
    } else {
      const badge = `${colors.bgWhite}${colors.black}${colors.bright} LOG ${colors.reset}`;

      if (args.length > 0) {
        const formattedMessage = formatLogMessage(badge, message);
        consola.log(formattedMessage, ...args);
      } else {
        const formattedMessage = formatLogMessage(badge, message);
        consola.log(formattedMessage);
      }
    }

    // Write to combined log file
    writeToLogFile('LOG', [message, ...args].map(arg => String(arg)).join(' '));
  },

  box(options: string | { title?: string; message: string | string[]; style?: any }): void {
    // Convert all box calls to simple info messages for cleaner output
    if (typeof options === 'string') {
      this.info(options);
    } else {
      const title = options.title || '';
      const messages = Array.isArray(options.message) ? options.message : [options.message];

      if (title) {
        this.info(`${title}: ${messages.join(' | ')}`);
      } else {
        this.info(messages.join(' | '));
      }
    }

    // Still write to log file for record keeping
    const message = typeof options === 'string' ? options :
      `${options.title ? `[${options.title}] ` : ''}${Array.isArray(options.message) ? options.message.join(' | ') : options.message}`;
    writeToLogFile('BOX', message);
  }
};

export default logger;
