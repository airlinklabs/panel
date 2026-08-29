import pino from "pino";
import chalk from "chalk";
import boxen from "boxen";
import cluster from "cluster";
import fs from "fs";
import path from "path";
import util from "util";

const logsDir = path.join(process.cwd(), "logs");
if (cluster.isPrimary && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const isDebugMode =
  process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
const useJsonFormat = process.env.LOG_FORMAT === "json";
const isTTY = process.stdout.isTTY;

// ── Secret redaction ─────────────────────────────────────────────────────────
const REDACTED = "***REDACTED***";

const SENSITIVE_KEYS =
  /("(?:password|passwd|secret|token|api[_ -]?key|client[_ -]?secret|access[_ -]?key|access[_ -]?token|auth(?:orization)?|authorization|refresh[_ -]?token|session[_ -]?id|cookie)"\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^\s,;]+))/gi;

const SENSITIVE_KEYS_UNQUOTED =
  /(\b(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?key|access[_-]?token|authorization|refresh[_-]?token|session[_-]?id)\b\s*:\s*)(?:"([^"]*)"|'([^']*)'|([^\s,;{}]+))/gi;

const SENSITIVE_HEADERS =
  /((?:authorization|set-cookie|cookie|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi;

const SENSITIVE_QUERY =
  /([?&](?:token|key|secret|api_key|access_token|password|auth)=)[^&\s]+/gi;

const redact = (input: string): string => {
  return input
    .replace(SENSITIVE_HEADERS, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(SENSITIVE_QUERY, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(SENSITIVE_KEYS, (match, prefix) => `${prefix}${REDACTED}`)
    .replace(
      SENSITIVE_KEYS_UNQUOTED,
      (match, prefix) => `${prefix}${REDACTED}`,
    );
};

export { redact };

// ── Pino logger ──────────────────────────────────────────────────────────────
const pinoLogger = pino({
  level: isDebugMode ? "debug" : "info",
  redact: {
    paths: [
      "password",
      "secret",
      "token",
      "apiKey",
      "clientSecret",
      "accessToken",
      "refreshToken",
      "authorization",
      "cookie",
      "sessionId",
      "passphrase",
      "signature",
      "nonce",
      "hmacSecret",
      "daemonKey",
      "privateKey",
    ],
    censor: REDACTED,
  },
  transport: useJsonFormat
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
});

// ── Colored badges for TTY ───────────────────────────────────────────────────
const badges = {
  ERROR: chalk.bgHex("#D32F2F").white.bold(" ERROR "),
  WARN: chalk.bgHex("#F57C00").white.bold(" WARN  "),
  INFO: chalk.bgHex("#1976D2").white.bold(" INFO  "),
  SUCCESS: chalk.bgHex("#388E3C").white.bold("  OK   "),
  DEBUG: chalk.bgHex("#7B1FA2").white.bold(" DEBUG "),
  LOG: chalk.bgHex("#616161").white.bold("  LOG  "),
};

// ── Serialization helpers ────────────────────────────────────────────────────
const serializeValue = (value: unknown): string => {
  if (value instanceof Error) {
    return redact(value.stack || `${value.name}: ${value.message}`);
  }
  if (typeof value === "string") {
    return redact(value);
  }
  return redact(
    util.inspect(value, {
      depth: 5,
      breakLength: 160,
      compact: true,
    }),
  );
};

const serializeContext = (context?: unknown): string => {
  if (context === undefined) {
    return "";
  }
  return ` ${serializeValue(context)}`;
};

// ── File writing (primary only) ──────────────────────────────────────────────
type LogPayload = {
  __log: boolean;
  level: string;
  message: string;
  context?: string;
  isError?: boolean;
};

const writeToLogFile = (level: string, message: string): void => {
  if (cluster.isWorker) {
    try {
      process.send?.({ __log: true, level, message } satisfies LogPayload);
    } catch {
      // IPC channel may be closed during shutdown.
    }
    return;
  }
  const timestamp = new Date().toISOString();
  fs.appendFile(
    path.join(logsDir, "combined.log"),
    `[${timestamp}] ${level}: ${redact(message)}\n`,
    (err) => {
      if (err) {
        pinoLogger.error("Failed to write to combined log file");
      }
    },
  );
};

const writeToErrorFile = (fileMessage: string): void => {
  if (cluster.isWorker) {
    return;
  }
  const timestamp = new Date().toISOString();
  fs.appendFile(
    path.join(logsDir, "error.log"),
    `[${timestamp}] ERROR: ${fileMessage}\n`,
    (err) => {
      if (err) {
        pinoLogger.error("Failed to write to error log file");
      }
    },
  );
};

// ── Primary process: receive logs from workers ───────────────────────────────
if (cluster.isPrimary) {
  cluster.on("message", (worker, payload: LogPayload) => {
    if (!payload || !payload.__log) {
      return;
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [W${worker.id}] ${payload.level}: ${payload.message}\n`;
    fs.appendFile(path.join(logsDir, "combined.log"), logLine, () => {});
    if (payload.isError) {
      fs.appendFile(
        path.join(logsDir, "error.log"),
        `[${timestamp}] [W${worker.id}] ERROR: ${payload.message}\n`,
        () => {},
      );
    }
  });
}

// ── Logger interface ─────────────────────────────────────────────────────────
const logger = {
  error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    const safeMessage = redact(message);
    const fileMessage = `${safeMessage}${serializeContext(context)}${error === undefined ? "" : `\n${serializeValue(error)}`}`;

    if (error instanceof Error) {
      pinoLogger.error({ err: error }, message);
    } else if (error !== undefined) {
      pinoLogger.error(message);
    } else {
      pinoLogger.error(message);
    }

    writeToErrorFile(fileMessage);
    writeToLogFile("ERROR", fileMessage);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    const text = `${redact(message)}${serializeContext(context)}`;
    pinoLogger.warn(message);
    writeToLogFile("WARN", text);
  },

  info(message: string, context?: Record<string, unknown>): void {
    const text = `${redact(message)}${serializeContext(context)}`;
    pinoLogger.info(message);
    writeToLogFile("INFO", text);
  },

  success(message: string, context?: Record<string, unknown>): void {
    const text = `${redact(message)}${serializeContext(context)}`;
    // pino has no "success" level — log at info with a marker
    pinoLogger.info(message);
    writeToLogFile("SUCCESS", text);
  },

  debug(message: string, context?: Record<string, unknown>): void {
    if (!isDebugMode) {
      return;
    }
    const text = `${redact(message)}${serializeContext(context)}`;
    pinoLogger.debug(message);
  },

  log(message: string, context?: Record<string, unknown>): void {
    const text = `${redact(message)}${serializeContext(context)}`;
    pinoLogger.info(message);
    writeToLogFile("LOG", text);
  },

  box(
    options:
      string | { title?: string; message: string | string[]; style?: any },
  ): void {
    if (typeof options === "string") {
      this.info(options);
      writeToLogFile("BOX", options);
      return;
    }

    const title = options.title || "";
    const messages = Array.isArray(options.message)
      ? options.message
      : [options.message];
    const text = title
      ? `${title}: ${messages.join(" | ")}`
      : messages.join(" | ");

    this.info(text);
    writeToLogFile("BOX", text);
  },
};

export default logger;

// ── Startup banner ───────────────────────────────────────────────────────────
const ASCII_LINES = [
  "  /$$$$$$ /$$         /$$/$$         /$$",
  " /$$__  $|__/        | $|__/        | $$",
  "| $$   $$/$$ /$$$$$$| $$/$$/$$$$$$$| $$   /$$",
  "| $$$$$$$| $$/$$__  $| $| $| $$__  $| $$  /$$/",
  "| $$__  $| $| $$  __| $| $| $$   $| $$$$$$/",
  "| $$  | $| $| $$     | $| $| $$  | $| $$_  $$",
  "| $$  | $| $| $$     | $| $| $$  | $| $$ \\  $$",
  "|__/  |__|__|__/     |__|__|__/  |__|__/  __/",
];

export function drawBanner(title: string, version: string, codename?: string) {
  if (!isTTY) {
    console.log(`${title} v${version}${codename ? ` — ${codename}` : ""}`);
    return;
  }

  // Each line individually wrapped in cyan so boxen renders ALL lines in color
  const colored = ASCII_LINES.map((l) => `${chalk.cyan(l)}`).join("\n");

  const lines: string[] = [];
  lines.push(colored);
  lines.push("");
  lines.push(`  ${chalk.bold.cyan(title)} ${chalk.dim(`v${version}`)}`);
  if (codename) {
    lines.push(`  ${chalk.dim(codename)}`);
  }
  lines.push(`  ${chalk.dim("Airlinklabs · MIT License")}`);

  console.log(
    boxen(lines.join("\n"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );
}
