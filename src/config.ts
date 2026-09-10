/**
 * Single validated source of truth for panel configuration.
 *
 * Read once at process start, after `loadEnv()` has populated process.env.
 * Centralises the fail-fast rules that used to live inside app.ts so an
 * insecure production setup fails loudly instead of silently generating a
 * fresh secret on every boot (which silently invalidates all sessions).
 *
 * The panel never writes secrets to .env at runtime. Operators set a strong
 * SESSION_SECRET via `node dist/cli/secret.js` (or by hand); in production a
 * missing/weak secret aborts startup.
 */

import crypto from 'crypto';
import logger from './handlers/logger';
import { logT } from './services/i18n';

export interface PanelConfig {
  /** NODE_ENV ('production' | 'development' | ...). */
  nodeEnv: string;
  /** True when NODE_ENV === 'production'. */
  isProduction: boolean;
  /** True when URL starts with https://. */
  isHttps: boolean;
  url: string;
  port: number;
  name: string;
  sessionSecret: string;
  databaseUrl: string;
  redisUrl: string;
  /** Trust proxy headers (X-Forwarded-For, X-Forwarded-Proto). */
  trustProxy: boolean;
  /** Explicit asset base URL for CDN or different-origin static files. */
  assetBaseUrl: string;
  /** Enable Content-Security-Policy headers. */
  cspEnabled: boolean;
  /** Cookie domain — set for cross-subdomain sessions. */
  cookieDomain: string;
  /** Allowed origins for CORS-like checks (comma-separated). */
  allowedOrigins: string[];
  /** Force secure cookies even on HTTP (for behind TLS proxy). */
  cookieSecure: boolean;
  /** Session max age in ms (0 = use default). */
  sessionMaxAgeMs: number;
  /** Global rate limit (requests per window). 0 = unlimited. */
  rateLimitMax: number;
  /** Rate limit window in ms. */
  rateLimitWindowMs: number;
  /** Log level for pino. */
  logLevel: string;
  /** Custom storage directory (empty = default). */
  storageDir: string;
  /** Max upload size in bytes. */
  maxUploadBytes: number;
  /** TLS cert path (empty = no direct TLS). */
  tlsCertPath: string;
  /** TLS key path (empty = no direct TLS). */
  tlsKeyPath: string;
  /** SMTP host (empty = email disabled). */
  smtpHost: string;
  /** SMTP port. */
  smtpPort: number;
  /** SMTP user. */
  smtpUser: string;
  /** SMTP pass. */
  smtpPass: string;
  /** SMTP from address. */
  smtpFrom: string;
  /** SMTP secure (TLS). */
  smtpSecure: boolean;
  /** DB pool min idle connections. */
  dbPoolMin: number;
  /** DB connect timeout in ms. */
  dbConnectTimeoutMs: number;
}

/** Minimum secret length we accept. Panel-generated secrets are 64 hex chars. */
const MIN_SECRET_LENGTH = 32;

/** Well-known placeholder/insecure values that must never be trusted. */
const KNOWN_INSECURE_SECRETS = new Set([
  'change_me',
  'dev-only-insecure-secret-change-me',
  'secret',
  'changeme',
  'insecure',
]);

/**
 * Returns true when a session secret is missing, a known placeholder, or too
 * short to provide meaningful security.
 */
export function isUnsafeSessionSecret(secret: string | undefined): boolean {
  if (!secret) {
    return true;
  }
  if (KNOWN_INSECURE_SECRETS.has(secret)) {
    return true;
  }
  return secret.length < MIN_SECRET_LENGTH;
}

/**
 * Resolves the session secret.
 *
 * - Production: a missing/weak secret is fatal — abort with a clear message.
 * - Development: fall back to an ephemeral random secret and warn that
 *   sessions will not survive a restart. We never write it back to .env here.
 */
export function resolveSessionSecret(
  secret: string | undefined,
  isProduction: boolean,
): string {
  if (!isUnsafeSessionSecret(secret)) {
    return secret as string;
  }

  if (isProduction) {
    throw new Error(
      'SESSION_SECRET is missing or insecure. Set a strong value in .env ' +
        '(generate one with `node dist/cli/secret.js`) and restart the panel.',
    );
  }

  logger.warn(logT('log.configSessionSecretInsecure'));
  return crypto.randomBytes(32).toString('hex');
}

/** Parses PORT, falling back to 3000 for any out-of-range/non-numeric value. */
export function parsePort(raw: string | undefined): number {
  const n = Number(raw ?? 3000);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return 3000;
  }
  return n;
}

/** Parses a positive integer, falling back to `fallback` for invalid/missing values. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return fallback;
  }
  return n;
}

/** Builds the validated panel configuration from the current process.env. */
export function getConfig(): PanelConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const url = process.env.URL || `http://localhost:${process.env.PORT || 3000}`;

  const trustProxy =
    process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  const assetBaseUrl = (process.env.ASSET_BASE_URL || '').replace(/\/+$/, '');
  const cspEnabled =
    process.env.CSP_ENABLED === 'true'
      ? true
      : process.env.CSP_ENABLED === 'false'
        ? false
        : isProduction; // default: enabled in production
  const cookieDomain = process.env.COOKIE_DOMAIN || '';
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    : [];

  // Cookie secure: explicit override > auto-detect from URL
  const cookieSecure =
    process.env.COOKIE_SECURE === 'true'
      ? true
      : process.env.COOKIE_SECURE === 'false'
        ? false
        : url.startsWith('https://');

  // Session
  const sessionMaxAgeMs = parsePositiveInt(
    process.env.SESSION_MAX_AGE_MS,
    7 * 24 * 60 * 60 * 1000,
  );

  // Rate limiting
  const rateLimitMax = parsePositiveInt(process.env.RATE_LIMIT_MAX, 500);
  const rateLimitWindowMs = parsePositiveInt(
    process.env.RATE_LIMIT_WINDOW_MS,
    60_000,
  );

  // Logging
  const logLevel = process.env.LOG_LEVEL || 'info';

  // Storage
  const storageDir = process.env.STORAGE_DIR || '';
  const maxUploadBytes = parsePositiveInt(
    process.env.MAX_UPLOAD_BYTES,
    50 * 1024 * 1024,
  );

  // TLS
  const tlsCertPath = process.env.TLS_CERT_PATH || '';
  const tlsKeyPath = process.env.TLS_KEY_PATH || '';

  // SMTP
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parsePositiveInt(process.env.SMTP_PORT, 587);
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpFrom = process.env.SMTP_FROM || '';
  const smtpSecure = process.env.SMTP_SECURE !== 'false'; // default true

  // Database pool
  const dbPoolMin = parsePositiveInt(process.env.DB_POOL_MIN, 2);
  const dbConnectTimeoutMs = parsePositiveInt(
    process.env.DB_CONNECT_TIMEOUT_MS,
    10_000,
  );

  return {
    nodeEnv,
    isProduction,
    isHttps: url.startsWith('https://'),
    url,
    port: parsePort(process.env.PORT),
    name: process.env.NAME || 'AirLink',
    sessionSecret: resolveSessionSecret(
      process.env.SESSION_SECRET,
      isProduction,
    ),
    databaseUrl:
      process.env.DATABASE_URL ||
      'postgresql://airlink:airlink@127.0.0.1:5432/airlink',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    trustProxy,
    assetBaseUrl,
    cspEnabled,
    cookieDomain,
    allowedOrigins,
    cookieSecure,
    sessionMaxAgeMs,
    rateLimitMax,
    rateLimitWindowMs,
    logLevel,
    storageDir,
    maxUploadBytes,
    tlsCertPath,
    tlsKeyPath,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    dbPoolMin,
    dbConnectTimeoutMs,
  };
}
