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
import util from 'util';

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
const useJsonFormat = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const consola = createConsola({
  level: isDebugMode ? 4 : 3,
  fancy: !useJsonFormat,
  formatOptions: {
    date: false,
    colors: !useJsonFormat,
    compact: useJsonFormat,
  },
}) as ConsolaInstance;

type LogContext = Record<string, unknown>;

const serializeValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') return value;

  return util.inspect(value, {
    depth: 5,
    breakLength: 160,
    compact: true,
  });
};

const serializeContext = (context?: unknown): string => {
  if (context === undefined) return '';
  return ` ${serializeValue(context)}`;
};

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
  error(message: string, error?: unknown, context?: LogContext): void {
    const badge = `${colors.bgRed}${colors.white}${colors.bright} ERROR ${colors.reset}`;
    const fileMessage = `${message}${serializeContext(context)}${error === undefined ? '' : `\n${serializeValue(error)}`}`;

    if (error instanceof Error) {
      consola.error(formatLogMessage(badge, message), error);
    } else {
      consola.error(formatLogMessage(badge, `${message}${serializeContext(error)}`));
    }

    const timestamp = new Date().toISOString();
    fs.appendFile(path.join(logsDir, 'error.log'), `[${timestamp}] ERROR: ${fileMessage}\n`, (err) => {
      if (err) consola.error('Failed to write to error log file:', err);
    });
    writeToLogFile('ERROR', fileMessage);
  },

  warn(message: string, context?: LogContext): void {
    const badge = `${colors.bgYellow}${colors.white}${colors.bright} WARN ${colors.reset}`;
    const text = `${message}${serializeContext(context)}`;
    consola.warn(formatLogMessage(badge, text));
    writeToLogFile('WARN', text);
  },

  info(message: string, context?: LogContext): void {
    const badge = `${colors.bgBlue}${colors.white}${colors.bright} INFO ${colors.reset}`;
    const text = `${message}${serializeContext(context)}`;
    consola.info(formatLogMessage(badge, `${colors.blue}${text}${colors.reset}`));
    writeToLogFile('INFO', text);
  },

  success(message: string, context?: LogContext): void {
    const badge = `${colors.bgGreen}${colors.white}${colors.bright} SUCCESS ${colors.reset}`;
    const text = `${message}${serializeContext(context)}`;
    consola.success(formatLogMessage(badge, text));
    writeToLogFile('SUCCESS', text);
  },

  debug(message: string, context?: LogContext): void {
    if (!isDebugMode) return;

    const badge = `${colors.bgMagenta}${colors.white}${colors.bright} DEBUG ${colors.reset}`;
    const text = `${message}${serializeContext(context)}`;
    consola.debug(formatLogMessage(badge, text));
  },

  log(message: string, context?: LogContext): void {
    const badge = `${colors.bgWhite}${colors.white}${colors.bright} LOG ${colors.reset}`;
    const text = `${message}${serializeContext(context)}`;
    consola.log(formatLogMessage(badge, text));
    writeToLogFile('LOG', text);
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
