/**
 * SSRF protection for panel-initiated HTTP fetches.
 *
 * Used by the egg import-by-URL flow and by the addon `validateUrl` security
 * helper. The goal is to stop server-side requests from reaching private,
 * loopback, link-local, and other non-routable destinations — both when the
 * literal hostname is private and when a public hostname *resolves* to a
 * private address (the classic metadata-service bypass).
 *
 * Callers are also responsible for limiting payload size and timeouts.
 */

import dns from 'dns';
import net from 'net';

const LOOKUP_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;

const dnsLookupAll = (hostname: string): Promise<dns.LookupAddress[]> =>
  new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve([]);
      }
    }, LOOKUP_TIMEOUT_MS);

    dns.lookup(
      hostname,
      { all: true, family: 0 },
      (_err, addresses) => {
        if (settled) {return;}
        settled = true;
        clearTimeout(timer);
        resolve(addresses ?? []);
      },
    );
  });

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {return false;}
  const a = parts[0] as number;
  const b = parts[1] as number;
  const c = parts[2] as number;

  if (a === 0) {return true;} // 0.0.0.0/8 – "this network"
  if (a === 10) {return true;} // 10.0.0.0/8
  if (a === 127) {return true;} // 127.0.0.0/8 – loopback
  if (a === 169 && b === 254) {return true;} // 169.254.0.0/16 – link-local
  if (a === 172 && b >= 16 && b <= 31) {return true;} // 172.16.0.0/12
  if (a === 192 && b === 168) {return true;} // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) {return true;} // 100.64.0.0/10 – CGNAT
  if (a === 198 && (b === 18 || b === 19)) {return true;} // 198.18.0.0/15 – benchmarking
  if (a === 192 && b === 0 && c === 0) {return true;} // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) {return true;} // 192.0.2.0/24 – documentation
  if (a === 198 && b === 51 && c === 100) {return true;} // 198.51.100.0/24 – documentation
  if (a === 203 && b === 0 && c === 113) {return true;} // 203.0.113.0/24 – documentation
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') {return true;} // loopback
  if (lower === '::') {return true;} // unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) {return true;} // fc00::/7 ULA
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — check the embedded IPv4.
    const embedded = lower.slice('::ffff:'.length);
    return isPrivateIpv4(embedded);
  }
  return false;
}

/** True when an IP literal is non-routable/private. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {return isPrivateIpv4(ip);}
  if (net.isIPv6(ip)) {return isPrivateIpv6(ip);}
  return false;
}

/** True when a hostname is an IP literal or a non-routable name. */
export function isPrivateHostname(hostname: string): boolean {
  if (isPrivateIp(hostname)) {return true;}
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) {return true;}
  if (lower === 'local' || lower.endsWith('.local')) {return true;}
  if (lower === 'metadata.google.internal' || lower.endsWith('.internal')) {return true;}
  return false;
}

export interface PublicUrlOptions {
  /** Allow plain http in addition to https (used by egg import which allows both). */
  allowHttp?: boolean;
}

export type UrlSafetyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates that a URL points at a public, routable host and that its hostname
 * does not resolve to any private address (DNS-level check).
 */
export async function assertSafePublicUrl(rawUrl: string, opts: PublicUrlOptions = {}): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) URLs are allowed' };
  }
  if (parsed.protocol === 'http:' && !opts.allowHttp) {
    return { ok: false, error: 'Only https URLs are allowed' };
  }

  const hostname = parsed.hostname;
  if (!hostname) {return { ok: false, error: 'URL has no hostname' };}

  if (isPrivateHostname(hostname)) {
    return { ok: false, error: 'Private/internal network hosts are not allowed' };
  }

  // DNS-level guard: a public-looking hostname may resolve to a private IP
  // (DNS rebinding / metadata service attacks).
  const addresses = await dnsLookupAll(hostname);
  if (addresses.length > 0 && addresses.some((a) => isPrivateIp(a.address))) {
    return { ok: false, error: 'Hostname resolves to a private/internal address' };
  }

  return { ok: true };
}

/** Extracts and validates the Location header of a redirect response. */
async function resolveRedirect(location: string | null, base: string): Promise<URL | null> {
  if (!location) {return null;}
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    return null;
  }
  const safety = await assertSafePublicUrl(next.toString());
  if (!safety.ok) {return null;}
  return next;
}

/**
 * Fetches a URL while re-validating every redirect hop. Returns the raw text
 * body (caller is responsible for size limiting and JSON parsing).
 */
export async function fetchPublic(
  rawUrl: string,
  opts: { allowHttp?: boolean; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ ok: true; body: string; status: number } | { ok: false; error: string }> {
  const safety = await assertSafePublicUrl(rawUrl, { allowHttp: opts.allowHttp });
  if (!safety.ok) {return safety;}

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let current: string = rawUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'AirlinkPanel/1.0' },
      });

      if (response.status >= 300 && response.status < 400) {
        const next = await resolveRedirect(response.headers.get('location'), current);
        if (!next) {return { ok: false, error: 'Unsafe or malformed redirect' };}
        current = next.toString();
        continue;
      }

      if (!response.ok) {
        return { ok: false, error: `Remote returned ${response.status}` };
      }

      const body = await response.text();
      if (opts.maxBytes && Buffer.byteLength(body) > opts.maxBytes) {
        return { ok: false, error: 'Remote response is too large' };
      }
      return { ok: true, body, status: response.status };
    }
    return { ok: false, error: `Too many redirects (${MAX_REDIRECTS})` };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, error: aborted ? 'Request timed out' : 'Failed to fetch URL' };
  } finally {
    clearTimeout(timer);
  }
}
