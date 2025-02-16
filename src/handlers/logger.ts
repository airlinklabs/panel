/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/airlink
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import fs from 'fs';
import path from 'path';

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
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

const logLevels = {
  error: {
    color: colors.red,
    bgColor: colors.bgRed,
    icon: '✖',
    label: 'ERROR',
  },
  warn: {
    color: colors.yellow,
    bgColor: colors.bgYellow,
    icon: '⚠',
    label: 'WARN',
  },
  info: {
    color: colors.blue,
    bgColor: colors.bgBlue,
    icon: 'ℹ',
    label: 'INFO',
  },
  success: {
    color: colors.green,
    bgColor: colors.bgGreen,
    icon: '✔',
    label: 'SUCCESS',
  },
  debug: {
    color: colors.magenta,
    bgColor: colors.bgMagenta,
    icon: '⚙',
    label: 'DEBUG',
  },
};

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
  private originalConsoleLog: (...args: any[]) => void;

  constructor() {
    // eslint-disable-next-line no-console
    this.originalConsoleLog = console.log;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').split('.')[0];
  }

  private formatMessage(
    level: keyof typeof logLevels,
    message: string,
  ): string {
    const { color, bgColor, icon, label } = logLevels[level];
    const timestamp = this.getTimestamp();
    const consoleOutput = `${colors.gray}${timestamp}${colors.reset} ${color}${icon} ${bgColor}${colors.bright}${label}${colors.reset} ${color}${message}${colors.reset}`;
    const fileOutput = `[${timestamp}] ${label}: ${message}\n`;
    const logFile = path.join(
      logsDir,
      level === 'error' ? 'error.log' : 'combined.log',
    );
    try {
      fs.appendFileSync(logFile, fileOutput);
    } catch (err) {
      this.originalConsoleLog(`Failed to write to log file: ${err}`);
    }

    return consoleOutput;
  }

  error(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const formattedMessage = this.formatMessage(
      'error',
      `${message}: ${errorMessage}`,
    );
    this.originalConsoleLog(formattedMessage);
  }

  warn(message: any): void {
    const formattedMessage = this.formatMessage('warn', String(message));
    this.originalConsoleLog(formattedMessage);
  }

  info(message: any): void {
    const formattedMessage = this.formatMessage('info', String(message));
    this.originalConsoleLog(formattedMessage);
  }

  success(message: any): void {
    const formattedMessage = this.formatMessage('success', String(message));
    this.originalConsoleLog(formattedMessage);
  }

  debug(...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
      const message = args
        .map((arg) =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg),
        )
        .join(' ');
      const formattedMessage = this.formatMessage('debug', message);
      this.originalConsoleLog(formattedMessage);
    }
  }

  log(...args: any[]): void {
    const message = args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg),
      )
      .join(' ');
    this.info(message);
  }
}

const logger = new Logger();

export default logger;
