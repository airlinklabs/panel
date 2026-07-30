import crypto from 'crypto';
import { URL } from 'url';
import prisma from '../../../db';
import { httpGet, httpPost, httpPut, httpPatch, httpDelete, type HttpResponse } from '../../../utils/http';

const SIGNATURE_WINDOW_S = 30;

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

export async function daemonScheme(): Promise<'http' | 'https'> {
  if (Date.now() - schemeCachedAt > SCHEME_CACHE_TTL_MS) {
    await refreshSchemeCache();
  }
  return cachedScheme;
}

export function daemonSchemeSync(): 'http' | 'https' {
  if (Date.now() - schemeCachedAt > SCHEME_CACHE_TTL_MS) {
    refreshSchemeCache(); // fire-and-forget
  }
  return cachedScheme;
}

export async function daemonBaseUrl(address: string, port: number | string): Promise<string> {
  const scheme = await daemonScheme();
  return `${scheme}://${address}:${port}`;
}

export const HMAC_PAYLOAD_VERSION = 1;

function hmacSign(key: string, method: string, path: string, body: string, timestamp: number, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function serializeRequestBody(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return '';
  if (typeof data === 'object' && data !== null && 'pipe' in (data as Record<string, unknown>)) {
    return '';
  }
  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

function signRequest(
  method: string,
  url: string,
  body: unknown,
  key: string,
): { timestamp: string; signature: string; nonce: string; payloadVersion: string } {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const serializedBody = serializeRequestBody(body);

  let urlPath: string;
  try {
    const parsed = new URL(url);
    urlPath = parsed.pathname;
  } catch {
    urlPath = url.split('?')[0] ?? '/';
  }

  const signature = hmacSign(key, method, urlPath, serializedBody, timestamp, nonce);

  return {
    timestamp: String(timestamp),
    signature,
    nonce,
    payloadVersion: String(HMAC_PAYLOAD_VERSION),
  };
}

function buildDaemonHeaders(key: string, method: string, url: string, body: unknown): Record<string, string> {
  const sig = signRequest(method, url, body, key);
  return {
    'X-Airlink-Timestamp': sig.timestamp,
    'X-Airlink-Signature': sig.signature,
    'X-Airlink-Nonce': sig.nonce,
    'X-Airlink-Payload-Version': sig.payloadVersion,
  };
}

export interface DaemonRequestOptions {
  nodeAddress: string;
  nodePort: number;
  nodeKey: string;
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  responseType?: 'json' | 'text' | 'arraybuffer' | 'stream';
}

export async function daemonRequest<T = unknown>(options: DaemonRequestOptions): Promise<HttpResponse<T>> {
  const { nodeAddress, nodePort, nodeKey, method, path, body, params, timeout, responseType } = options;
  const url = `${daemonSchemeSync()}://${nodeAddress}:${nodePort}${path}`;

  const hmacHeaders = buildDaemonHeaders(nodeKey, method, url, body);

  const methodUpper = method.toUpperCase();
  const httpOpts = {
    params,
    timeout,
    responseType,
    headers: hmacHeaders,
    auth: { username: 'Airlink', password: nodeKey },
  };

  switch (methodUpper) {
  case 'POST':
    return httpPost<T>(url, body, httpOpts);
  case 'PUT':
    return httpPut<T>(url, body, httpOpts);
  case 'PATCH':
    return httpPatch<T>(url, body, httpOpts);
  case 'DELETE':
    return httpDelete<T>(url, body, httpOpts);
  default:
    return httpGet<T>(url, httpOpts);
  }
}

export { SIGNATURE_WINDOW_S };
export type { HttpResponse };
