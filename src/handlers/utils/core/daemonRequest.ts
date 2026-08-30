import { getSettings } from '../../settingsCache';
import crypto from 'crypto';
import { createReadStream, createWriteStream, promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import {
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
  type HttpResponse,
} from '../../../utils/http';
export type { HttpResponse } from '../../../utils/http';

const SIGNATURE_WINDOW_S = 30;
const NONCE_BYTE_LENGTH = 16;

// Canonical request target encoder — HMAC covers the exact URI (pathname + sorted, percent-encoded params).
export type CanonicalParams = Record<
  string,
  string | number | boolean | undefined
>;

function percentEncode(s: string): string {
  // RFC 3986 unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
  // Encode everything else, including spaces (no + form).
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds the canonical request target that HMAC covers.
 *
 * - Sorts params by (key, value) ascending.
 * - Forbids duplicate scalar keys (throws).
 * - Returns `pathname` or `pathname?encodedSortedParams`.
 */
export function buildCanonicalTarget(
  pathname: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) {
    return pathname;
  }

  const entries: [string, string][] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    const encodedKey = percentEncode(key);
    const encodedVal = percentEncode(String(value));

    if (seen.has(encodedKey)) {
      throw new Error(`duplicate query key "${key}" in daemon request params`);
    }
    seen.add(encodedKey);
    entries.push([encodedKey, encodedVal]);
  }

  if (entries.length === 0) {
    return pathname;
  }

  // Sort by encoded key, then by encoded value for deterministic signing.
  entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  const qs = entries.map(([k, v]) => `${k}=${v}`).join('&');
  return `${pathname}?${qs}`;
}

let cachedScheme: 'http' | 'https' = 'http';
let schemeCachedAt = 0;
const SCHEME_CACHE_TTL_MS = 60_000;

async function refreshSchemeCache(): Promise<void> {
  try {
    const s = await getSettings();
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

export async function daemonBaseUrl(
  address: string,
  port: number | string,
): Promise<string> {
  const scheme = await daemonScheme();
  return `${scheme}://${address}:${port}`;
}

export const HMAC_PAYLOAD_VERSION = 1;

// Basic auth is deprecated. It is retained only during a versioned migration
// period. When the panel no longer sends Basic auth, set this to false.
// The daemon should log a deprecation warning when it receives Basic auth.
export const SEND_BASIC_AUTH = true;

// HMAC v1: bodies are signed as `digest:<sha256 hex of the exact bytes sent>`.
// The digest must be computed over the same bytes that hit the wire — strings
// and JSON over their utf8 encoding, buffers over their raw bytes, and streams
// over the bytes they produce (spooled when no trusted checksum is available).
function hmacSign(
  key: string,
  method: string,
  path: string,
  bodyRepr: string,
  timestamp: number,
  nonce: string,
): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${bodyRepr}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isStreamLike(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    typeof record.pipe === 'function' || typeof record.getReader === 'function'
  );
}

// Spools an unknown stream to a temp file, hashing as it goes, so the signed
// digest covers the exact bytes that are later streamed to the daemon. The
// spool is bounded so an untrusted/garbled stream can't exhaust panel disk.
const MAX_SPOOL_BYTES = 100 * 1024 * 1024; // matches daemon MAX_REQUEST_BODY_BYTES
async function spoolStreamToTemp(
  stream: NodeJS.ReadableStream | ReadableStream,
): Promise<{
  file: string;
  digest: string;
}> {
  const file = path.join(
    os.tmpdir(),
    `airlink-hmac-${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  const hash = crypto.createHash('sha256');
  const nodeStream: NodeJS.ReadableStream = isWebStream(stream)
    ? Readable.fromWeb(stream as never)
    : stream;

  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(file);
    nodeStream.on('data', (chunk: Buffer | string) => {
      total += chunk.length;
      hash.update(chunk);
      if (total > MAX_SPOOL_BYTES) {
        // destroying the destination stops the pipe; the writable 'error' event
        // rejects the promise below with the cap violation
        ws.destroy(new Error('stream exceeds the spool cap'));
      }
    });
    nodeStream.pipe(ws);
    nodeStream.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
  });

  if (total > MAX_SPOOL_BYTES) {
    await fsp.unlink(file).catch(() => {
      /* noop */
    });
    throw new Error(`stream exceeds the ${MAX_SPOOL_BYTES}-byte spool cap`);
  }

  return { file, digest: hash.digest('hex') };
}

function isWebStream(
  stream: NodeJS.ReadableStream | ReadableStream,
): stream is ReadableStream {
  return typeof (stream as ReadableStream).getReader === 'function';
}

// bodyToWire resolves the exact bytes for the wire and their sha256 digest. Digest is null for empty bodies.
async function bodyToWire(
  body: unknown,
  contentDigest?: string,
): Promise<{ wireBody: unknown; digest: string | null; tempFile?: string }> {
  if (body === null || body === undefined) {
    return { wireBody: undefined, digest: null };
  }

  if (typeof body === 'string') {
    return { wireBody: body, digest: sha256Hex(Buffer.from(body, 'utf8')) };
  }

  if (Buffer.isBuffer(body)) {
    return { wireBody: body, digest: sha256Hex(body) };
  }

  if (isStreamLike(body)) {
    if (contentDigest) {
      return { wireBody: body, digest: contentDigest.toLowerCase() };
    }
    const { file, digest } = await spoolStreamToTemp(
      body as NodeJS.ReadableStream | ReadableStream,
    );
    return { wireBody: createReadStream(file), digest, tempFile: file };
  }

  try {
    const json = JSON.stringify(body);
    if (json === undefined) {
      return { wireBody: undefined, digest: null };
    }
    return { wireBody: json, digest: sha256Hex(Buffer.from(json, 'utf8')) };
  } catch {
    return { wireBody: undefined, digest: null };
  }
}

function buildDaemonHeaders(
  key: string,
  method: string,
  canonicalTarget: string,
  bodyRepr: string,
  digest: string | null,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(NONCE_BYTE_LENGTH).toString('hex');

  const signature = hmacSign(
    key,
    method,
    canonicalTarget,
    bodyRepr,
    timestamp,
    nonce,
  );

  return {
    'X-Airlink-Timestamp': String(timestamp),
    'X-Airlink-Signature': signature,
    'X-Airlink-Nonce': nonce,
    'X-Airlink-Payload-Version': String(HMAC_PAYLOAD_VERSION),
    ...(digest ? { 'X-Airlink-Digest': `sha256:${digest}` } : {}),
  };
}

export interface DaemonRequestOptions {
  nodeAddress: string;
  nodePort: number;
  nodeKey: string;
  method: string;
  path: string;
  body?: unknown;
  /**
   * sha256 hex of the exact body bytes that will be streamed. Lets known
   * checksums (e.g. backup files verified at creation) skip the temp-file
   * spool while keeping the signed digest truthful.
   */
  contentDigest?: string;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  responseType?: 'json' | 'text' | 'arraybuffer' | 'stream';
  /** Stable request ID for distributed tracing (forwarded as X-Request-Id). */
  requestId?: string;
  /** Idempotency key for unsafe operations (POST/PUT/PATCH/DELETE). Prevents duplicate side effects on retry. */
  idempotencyKey?: string;
}

export async function daemonRequest<T = unknown>(
  options: DaemonRequestOptions,
): Promise<HttpResponse<T>> {
  const {
    nodeAddress,
    nodePort,
    nodeKey,
    method,
    path,
    body,
    contentDigest,
    params,
    timeout,
    responseType,
    requestId,
    idempotencyKey,
  } = options;
  const methodUpper = method.toUpperCase();

  // Build canonical target before signing — HMAC must cover the exact URI the daemon receives.
  const canonicalTarget = buildCanonicalTarget(path, params);
  const url = `${await daemonScheme()}://${nodeAddress}:${nodePort}${canonicalTarget}`;

  const isBodyless = methodUpper === 'GET' || methodUpper === 'HEAD';
  const wire = isBodyless
    ? { wireBody: undefined as unknown, digest: null as string | null }
    : await bodyToWire(body, contentDigest);

  const hmacHeaders = buildDaemonHeaders(
    nodeKey,
    methodUpper,
    canonicalTarget,
    wire.digest ? `digest:${wire.digest}` : '',
    wire.digest,
  );

  const httpOpts = {
    timeout,
    responseType,
    headers: {
      ...hmacHeaders,
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    // Basic auth is deprecated — only sent during migration period.
    // HMAC is the authoritative auth mechanism.
    ...(SEND_BASIC_AUTH
      ? { auth: { username: 'Airlink', password: nodeKey } }
      : {}),
  };

  try {
    switch (methodUpper) {
    case 'POST':
      return httpPost<T>(url, wire.wireBody, httpOpts);
    case 'PUT':
      return httpPut<T>(url, wire.wireBody, httpOpts);
    case 'PATCH':
      return httpPatch<T>(url, wire.wireBody, httpOpts);
    case 'DELETE':
      return httpDelete<T>(url, wire.wireBody, httpOpts);
    default:
      return httpGet<T>(url, httpOpts);
    }
  } finally {
    if (wire.tempFile) {
      await fsp.unlink(wire.tempFile).catch(() => {
        // best-effort temp cleanup
      });
    }
  }
}

export { SIGNATURE_WINDOW_S };
