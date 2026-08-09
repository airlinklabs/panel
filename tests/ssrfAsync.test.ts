import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dns from 'dns';
import { assertSafePublicUrl, fetchPublic } from '../src/utils/ssrf';

const PUBLIC_IP = '8.8.8.8';
const PRIVATE_IP = '10.0.0.5';

let originalLookup: typeof dns.lookup;

beforeEach(() => {
  originalLookup = dns.lookup;
  // Default: hostnames resolve to a public address.
  vi.spyOn(dns, 'lookup').mockImplementation(((hostname: string, opts: unknown, cb: (err: unknown, addrs?: dns.LookupAddress[] | string) => void) => {
    const addresses: dns.LookupAddress[] = [{ address: PUBLIC_IP, family: 4 }];
    if (typeof opts === 'function') (opts as (err: unknown, addrs?: dns.LookupAddress[] | string) => void)(null, addresses);
    else cb(null, addresses);
  }) as unknown as typeof dns.lookup);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ssrf: assertSafePublicUrl (DNS-aware)', () => {
  it('blocks literal private hosts before any DNS lookup', async () => {
    expect(await assertSafePublicUrl('https://localhost:8080/x')).toEqual({ ok: false, error: expect.stringContaining('Private/internal') });
    expect(await assertSafePublicUrl('https://127.0.0.1/x')).toEqual({ ok: false, error: expect.stringContaining('Private/internal') });
    expect(await assertSafePublicUrl('https://192.168.1.10/x')).toEqual({ ok: false, error: expect.stringContaining('Private/internal') });
  });

  it('blocks a hostname that resolves to a private address (DNS rebinding)', async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.spyOn>).mockImplementation((
      _hostname: string, _opts: unknown, cb: (err: unknown, addrs?: dns.LookupAddress[] | string) => void,
    ) => cb(null, [{ address: PRIVATE_IP, family: 4 }]));
    expect(await assertSafePublicUrl('https://example.com/x')).toEqual({ ok: false, error: expect.stringContaining('private/internal address') });
  });

  it('accepts a public hostname resolving to a public address', async () => {
    expect(await assertSafePublicUrl('https://example.com/egg.json')).toEqual({ ok: true });
  });

  it('accepts a hostname that fails to resolve', async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.spyOn>).mockImplementation((
      _hostname: string, _opts: unknown, cb: (err: unknown, addrs?: dns.LookupAddress[] | string) => void,
    ) => cb({ code: 'ENOTFOUND' } as NodeJS.ErrnoException, []));
    expect(await assertSafePublicUrl('https://no-such-host.invalid/x')).toEqual({ ok: true });
  });

  it('enforces protocol rules', async () => {
    expect(await assertSafePublicUrl('ftp://example.com/x')).toEqual({ ok: false, error: expect.stringContaining('http(s)') });
    expect(await assertSafePublicUrl('http://example.com/x')).toEqual({ ok: false, error: expect.stringContaining('https') });
    expect(await assertSafePublicUrl('http://example.com/x', { allowHttp: true })).toEqual({ ok: true });
  });
});

describe('ssrf: fetchPublic redirect handling', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns the body for a direct 200', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '{"ok":true}',
    });
    const result = await fetchPublic('https://example.com/a.json');
    expect(result).toEqual({ ok: true, body: '{"ok":true}', status: 200 });
  });

  it('refuses to follow a redirect to a private host', async () => {
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://127.0.0.1:8080/secret' }),
      text: async () => '',
    });
    const result = await fetchPublic('https://example.com/start');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('redirect');
    expect(mockFetch).toHaveBeenCalledTimes(1); // never followed
  });

  it('follows a redirect to a safe public host', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 301,
        ok: false,
        headers: new Headers({ location: 'https://cdn.example.com/final.json' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: async () => '{"final":true}',
      });
    const result = await fetchPublic('https://example.com/start');
    expect(result).toEqual({ ok: true, body: '{"final":true}', status: 200 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops after the redirect limit', async () => {
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'https://cdn.example.com/loop' }),
      text: async () => '',
    });
    const result = await fetchPublic('https://example.com/start');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Too many redirects');
  });

  it('rejects a relative redirect that lands on a private host', async () => {
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://10.0.0.9/internal' }),
      text: async () => '',
    });
    const result = await fetchPublic('https://example.com/start');
    expect(result.ok).toBe(false);
  });
});
