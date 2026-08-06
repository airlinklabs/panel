/**
 * Error sanitization for client-facing messages.
 *
 * Raw internal errors — daemon/Docker paths, mysql hostnames, S3 keys,
 * view paths, stack traces — must never reach the browser. Classify the
 * error, return a fixed safe message (plus an optional recovery hint), and
 * keep the raw detail for the server log only.
 */

export type ErrorCategory =
  | 'daemon'
  | 'database'
  | 'filesystem'
  | 'network'
  | 'validation'
  | 'unknown';

const CATEGORY_FALLBACK: Record<ErrorCategory, string> = {
  daemon: 'The server daemon could not complete the request.',
  database: 'The database could not complete the request.',
  filesystem: 'The file system could not complete the request.',
  network: 'The network request could not be completed.',
  validation: 'The request could not be validated.',
  unknown: 'Something went wrong. Please try again.',
};

const CATEGORY_HINT: Partial<Record<ErrorCategory, string>> = {
  daemon: 'Check that the node is online, then try again.',
  database: 'Check the database host settings, then try again.',
  network: 'Check your connection, then try again.',
};

const DAEMON_MARKERS = [
  'docker',
  'container',
  '/var/lib/docker',
  'docker.sock',
  'failed to attach',
  'no such container',
  'oci runtime',
  'image not found',
  'manifest unknown',
  'pull access denied',
  'repository does not exist',
  'daemon returned',
];

const DATABASE_MARKERS = [
  'ecnrefused',
  'er_access_denied',
  'er_con_count_error',
  'er_bad_db_error',
  'er_no_such_db',
  'er_unknown_database',
  'mysql2',
  'prismaclient',
  'sqlstate',
  'password authentication failed',
  'duplicate key',
  's3',
  'bucket',
  'amazonaws',
  'socket hang up',
];

const FILESYSTEM_MARKERS = ['enoent', 'eacces', 'eperm', 'enotdir', 'eisdir', 'eexist', 'enospc'];

const NETWORK_MARKERS = [
  'ecnrefused',
  'enotfound',
  'eai_again',
  'etimedout',
  'econnreset',
  'timed out',
  'fetch failed',
  'network',
];

/** Extract a raw, short message from an unknown thrown value (for logs only). */
export function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (typeof record.detail === 'string') {
      return record.detail;
    }
  }
  return String(error ?? '');
}

function classify(raw: string): ErrorCategory {
  const lower = raw.toLowerCase();
  for (const marker of FILESYSTEM_MARKERS) {
    if (lower.includes(marker)) {
      return 'filesystem';
    }
  }
  for (const marker of NETWORK_MARKERS) {
    if (lower.includes(marker)) {
      return 'network';
    }
  }
  for (const marker of DATABASE_MARKERS) {
    if (lower.includes(marker)) {
      return 'database';
    }
  }
  for (const marker of DAEMON_MARKERS) {
    if (lower.includes(marker)) {
      return 'daemon';
    }
  }
  return 'unknown';
}

export interface SanitizedErrorInfo {
  category: ErrorCategory;
  safeMessage: string;
  hint?: string;
  /** Raw detail — never send to clients. For server logs only. */
  debug: string;
}

export interface SanitizeErrorOptions {
  /** Preferred safe message when it overrides the category fallback. */
  fallback?: string;
  hint?: string;
}

export function sanitizeError(error: unknown, options?: SanitizeErrorOptions): SanitizedErrorInfo {
  const raw = rawErrorMessage(error);
  const category = classify(raw);
  return {
    category,
    safeMessage: options?.fallback || CATEGORY_FALLBACK[category],
    hint: options?.hint || CATEGORY_HINT[category],
    debug: raw,
  };
}

/**
 * Convenience helper: produce a safe client-facing message for a failed
 * request, preferring a caller-supplied fallback and otherwise a fixed
 * category message. Never contains internal details.
 */
export function safeClientMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  return sanitizeError(error, { fallback }).safeMessage;
}

/**
 * Extract the user-facing message from a daemon API error body.
 *
 * The daemon is an HMAC-signed trusted peer; its structured `error`/`message`
 * fields are curated, short strings authored by our own daemon handlers (for
 * example `Invalid name` from /fs/rename). Those fields are the panel-daemon
 * API contract and may be relayed verbatim. Raw values are never accepted:
 * anything that is not a non-empty string falls back to the caller's message.
 */
export function daemonMessage(
  body: unknown,
  fallback = 'The server daemon could not complete the request.',
): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const candidate = record.error ?? record.message;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return fallback;
}

/** Extract the error body attached to a thrown HTTP/daemon error, if any. */
export function errorBody(error: unknown): unknown {
  if (error && typeof error === 'object') {
    return (error as Record<string, unknown>).body;
  }
  return undefined;
}

/**
 * Strict production posture. Only an explicit development/debug env exposes
 * internal error detail; an unset NODE_ENV is treated as production-safe so
 * missing .env files cannot accidentally leak internals to visitors.
 */
export function isProductionPosture(): boolean {
  const env = (process.env.NODE_ENV || 'production').toLowerCase();
  const debug = process.env.DEBUG === 'true';
  return (env === 'production' || env === 'prod') && !debug;
}
