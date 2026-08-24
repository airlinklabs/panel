
import type { ConsolaInstance } from 'consola';
import { createConsola } from 'consola';
import cluster from 'cluster';
import fs from 'fs';
import path from 'path';
import util from 'util';

const logsDir = path.join(process.cwd(), 'logs');
if (cluster.isPrimary && !fs.existsSync(logsDir)) {
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

/** Wire format sent from workers → primary via IPC. */
interface LogPayload {
  __log: boolean;
  level: string;
  message: string;
  context?: string;
  isError?: boolean;
}

const REDACTED = '***REDACTED***';

const SENSITIVE_KEYS =
  /("(?:password|passwd|secret|token|api[_ -]?key|client[_ -]?secret|access[_ -]?key|access[_ -]?token|auth(?:orization)?|authorization|refresh[_ -]?token|session[_ -]?id|cookie)"\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^\s,;]+))/gi;

const SENSITIVE_KEYS_UNQUOTED =
  /(\b(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?key|access[_-]?token|authorization|refresh[_-]?token|session[_-]?id)\b\s*:\s*)(?:"([^"]*)"|'([^']*)'|([^\s,;{}]+))/gi;

const SENSITIVE_HEADERS =
  /((?:authorization|set-cookie|cookie|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi;

const SENSITIVE_QUERY = /([?&](?:token|key|secret|api_key|access_token|password|auth)=)[^&\s]+/gi;

const redact = (input: string): string => {
  return input
    .replace(SENSITIVE_HEADERS, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(SENSITIVE_QUERY, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(SENSITIVE_KEYS, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(SENSITIVE_KEYS_UNQUOTED, (match, prefix) => `${prefix}${REDACTED}`);
};

export { redact };

const serializeValue = (value: unknown): string => {
  if (value instanceof Error) {
    return redact(value.stack || `${value.name}: ${value.message}`);
  }

  if (typeof value === 'string') {return redact(value);}

  return redact(util.inspect(value, {
    depth: 5,
    breakLength: 160,
    compact: true,
  }));
};

const serializeContext = (context?: unknown): string => {
  if (context === undefined) {return '';}
  return ` ${serializeValue(context)}`;
};

// ── File writing (primary only) ──────────────────────────────────────────────
const writeToLogFile = (level: string, message: string): void => {
  if (cluster.isWorker) {
    // Workers send log data to the primary via IPC — no direct file writes.
    try {
      process.send?.({ __log: true, level, message } satisfies LogPayload);
    } catch {
      // IPC channel may be closed during shutdown.
    }
    return;
  }
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${redact(message)}\n`;
  fs.appendFile(path.join(logsDir, 'combined.log'), logMessage, (err) => {
    if (err) {consola.error('Failed to write to combined log file:', err);}
  });
};

const writeToErrorFile = (fileMessage: string): void => {
  if (cluster.isWorker) {return;} // primary handles file writes
  const timestamp = new Date().toISOString();
  fs.appendFile(path.join(logsDir, 'error.log'), `[${timestamp}] ERROR: ${fileMessage}\n`, (err) => {
    if (err) {consola.error('Failed to write to error log file:', err);}
  });
};

// ── Primary process: receive logs from workers ───────────────────────────────
if (cluster.isPrimary) {
  cluster.on('message', (worker, payload: LogPayload) => {
    if (!payload || !payload.__log) {return;}
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [W${worker.id}] ${payload.level}: ${payload.message}\n`;

    fs.appendFile(path.join(logsDir, 'combined.log'), logLine, () => {});
    if (payload.isError) {
      fs.appendFile(path.join(logsDir, 'error.log'), `[${timestamp}] [W${worker.id}] ERROR: ${payload.message}\n`, () => {});
    }
  });
}

const getTimestamp = (): string => {
  const now = new Date();
  return [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join(':');
};

const workerTag = cluster.isWorker ? ` [W${cluster.worker?.id}]` : '';

const formatLogMessage = (badge: string, message: string, maxWidth = 120): string => {
  const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
  const tag = `${colors.dim}${workerTag}${colors.reset}`;
  const padding = ' '.repeat(Math.max(0, maxWidth - (badge.length + message.length + tag.length + timestamp.length)));
  return `${badge} ${message}${tag}${padding}${timestamp}`;
};

const logger = {
  error(message: string, error?: unknown, context?: LogContext): void {
    const badge = `${colors.bgRed}${colors.white}${colors.bright} ERROR ${colors.reset}`;
    const safeMessage = redact(message);
    const fileMessage = `${safeMessage}${serializeContext(context)}${error === undefined ? '' : `\n${serializeValue(error)}`}`;

    if (error instanceof Error) {
      consola.error(formatLogMessage(badge, safeMessage), error);
    } else {
      consola.error(formatLogMessage(badge, `${safeMessage}${serializeContext(error)}`));
    }

    writeToErrorFile(fileMessage);
    writeToLogFile('ERROR', fileMessage);
  },

  warn(message: string, context?: LogContext): void {
    const badge = `${colors.bgYellow}${colors.white}${colors.bright} WARN ${colors.reset}`;
    const text = `${redact(message)}${serializeContext(context)}`;
    consola.warn(formatLogMessage(badge, text));
    writeToLogFile('WARN', text);
  },

  info(message: string, context?: LogContext): void {
    const badge = `${colors.bgBlue}${colors.white}${colors.bright} INFO ${colors.reset}`;
    const text = `${redact(message)}${serializeContext(context)}`;
    consola.info(formatLogMessage(badge, `${colors.blue}${text}${colors.reset}`));
    writeToLogFile('INFO', text);
  },

  success(message: string, context?: LogContext): void {
    const badge = `${colors.bgGreen}${colors.white}${colors.bright} SUCCESS ${colors.reset}`;
    const text = `${redact(message)}${serializeContext(context)}`;
    consola.success(formatLogMessage(badge, text));
    writeToLogFile('SUCCESS', text);
  },

  debug(message: string, context?: LogContext): void {
    if (!isDebugMode) {return;}

    const badge = `${colors.bgMagenta}${colors.white}${colors.bright} DEBUG ${colors.reset}`;
    const text = `${redact(message)}${serializeContext(context)}`;
    consola.debug(formatLogMessage(badge, text));
  },

  log(message: string, context?: LogContext): void {
    const badge = `${colors.bgWhite}${colors.white}${colors.bright} LOG ${colors.reset}`;
    const text = `${redact(message)}${serializeContext(context)}`;
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
