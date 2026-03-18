import crypto from 'crypto';
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { URL } from 'url';

const SIGNATURE_WINDOW_S = 30;

function hmacSign(key: string, method: string, path: string, body: string, timestamp: number): string {
  const payload = `${timestamp}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

// Extract the daemon key from a Basic Auth header value.
// axios encodes credentials as "Airlink:<key>" in Base64.
function extractKeyFromAuth(auth: { username?: string; password?: string } | undefined): string | null {
  if (!auth) return null;
  return auth.password ?? null;
}

// One-time setup — call this at panel startup (in app.ts).
// After this, every axios request that carries { auth: { username: 'Airlink', password: key } }
// automatically gets X-Airlink-Timestamp and X-Airlink-Signature headers added.
export function installDaemonRequestInterceptor(): void {
  axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // Only sign requests that carry Airlink basic auth (i.e. daemon requests).
    if (!config.auth || (config.auth as any).username !== 'Airlink') {
      return config;
    }

    const key = extractKeyFromAuth(config.auth);
    if (!key) return config;

    const method = (config.method || 'GET').toUpperCase();

    // Derive the path from the URL — we only sign path + query, not host.
    let urlPath = '/';
    try {
      const parsed = new URL(config.url || '', 'http://localhost');
      urlPath = parsed.pathname + parsed.search;
    } catch {
      urlPath = config.url || '/';
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
