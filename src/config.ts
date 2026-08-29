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

import crypto from "crypto";

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
}

/** Minimum secret length we accept. Panel-generated secrets are 64 hex chars. */
const MIN_SECRET_LENGTH = 32;

/** Well-known placeholder/insecure values that must never be trusted. */
const KNOWN_INSECURE_SECRETS = new Set([
  "change_me",
  "dev-only-insecure-secret-change-me",
  "secret",
  "changeme",
  "insecure",
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
      "SESSION_SECRET is missing or insecure. Set a strong value in .env " +
        "(generate one with `node dist/cli/secret.js`) and restart the panel.",
    );
  }

  console.warn(
    "[config] SESSION_SECRET is missing or insecure. Generated an ephemeral secret " +
      "for this boot — sessions will NOT survive a restart. In production this is fatal.",
  );
  return crypto.randomBytes(32).toString("hex");
}

/** Parses PORT, falling back to 3000 for any out-of-range/non-numeric value. */
export function parsePort(raw: string | undefined): number {
  const n = Number(raw ?? 3000);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return 3000;
  }
  return n;
}

/** Builds the validated panel configuration from the current process.env. */
export function getConfig(): PanelConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const url = process.env.URL || `http://localhost:${process.env.PORT || 3000}`;

  return {
    nodeEnv,
    isProduction,
    isHttps: url.startsWith("https://"),
    url,
    port: parsePort(process.env.PORT),
    name: process.env.NAME || "AirLink",
    sessionSecret: resolveSessionSecret(
      process.env.SESSION_SECRET,
      isProduction,
    ),
    databaseUrl:
      process.env.DATABASE_URL ||
      "postgresql://airlink:airlink@127.0.0.1:5432/airlink",
    redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  };
}
