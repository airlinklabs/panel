import crypto from 'crypto';
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { URL } from 'url';
import prisma from '../../../db';

const SIGNATURE_WINDOW_S = 30;

// ── Protocol helper ──────────────────────────────────────────────────────────
//
// Reads enforceDaemonHttps from the DB once, then caches for 60 s so we're
// not hitting SQLite on every single daemon request. Falls back to http when
// the setting is off or the DB is unreachable.

let cachedScheme: 'http' | 'https' = 'http';
let schemeCachedAt = 0;
const SCHEME_CACHE_TTL_MS = 60_000;

async function refreshSchemeCache(): Promise<void> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    cachedScheme = s?.enforceDaemonHttps ? 'https' : 'http';
  } catch {
    // Leave whatever we had before — don't crash on DB error.
  }
  schemeCachedAt = Date.now();
}

// Returns 'http' or 'https' depending on the enforceDaemonHttps setting.
// Safe to call on every request — actual DB hit is at most once per minute.
export async function daemonScheme(): Promise<'http' | 'https'> {
  if (Date.now() - schemeCachedAt > SCHEME_CACHE_TTL_MS) {
    await refreshSchemeCache();
  }
  return cachedScheme;
}

// Synchronous version — returns the cached value (may be stale up to 60 s).
// Use this where you cannot await (e.g. inside a sync HMAC interceptor).
export function daemonSchemeSync(): 'http' | 'https' {
  if (Date.now() - schemeCachedAt > SCHEME_CACHE_TTL_MS) {
    refreshSchemeCache(); // fire-and-forget
  }
  return cachedScheme;
}

// Convenience: build the base URL for a node, e.g. "http://1.2.3.4:3001"
export async function daemonBaseUrl(address: string, port: number | string): Promise<string> {
  const scheme = await daemonScheme();
  return `${scheme}://${address}:${port}`;
}

// ── HMAC signing ─────────────────────────────────────────────────────────────

function hmacSign(key: string, method: string, path: string, body: string, timestamp: number): string {
  const payload = `${timestamp}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function extractKeyFromAuth(auth: { username?: string; password?: string } | undefined): string | null {
  if (!auth) return null;
  return auth.password ?? null;
}

// Install once at panel startup. After this, every axios request that carries
// { auth: { username: 'Airlink', password: key } } automatically gets
// X-Airlink-Timestamp and X-Airlink-Signature headers added.
export function installDaemonRequestInterceptor(): void {
  axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (!config.auth || (config.auth as any).username !== 'Airlink') {
      return config;
    }

    const key = extractKeyFromAuth(config.auth);
    if (!key) return config;

    const method = (config.method || 'GET').toUpperCase();

    let urlPath = '/';
    try {
      const parsed = new URL(config.url || '', 'http://localhost');
      urlPath = parsed.pathname;
    } catch {
      urlPath = (config.url || '/').split('?')[0];
    }

    const body = config.data
      ? typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
      : '';

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = hmacSign(key, method, urlPath, body, timestamp);

    config.headers.set('X-Airlink-Timestamp', String(timestamp));
    config.headers.set('X-Airlink-Signature', signature);

    return config;
  });
}

export { SIGNATURE_WINDOW_S };
