import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InternalApiError,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  resetBaseUrl,
} from '../src/handlers/internalApiClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Express-like Request for testing. */
function makeReq(cookies?: Record<string, string>, csrfHeader?: string) {
  const headers: Record<string, string | string[]> = {};
  if (csrfHeader) {
    headers['x-csrf-token'] = csrfHeader;
  }
  return {
    cookies: cookies ?? {},
    headers,
    body: csrfHeader ? { _csrf: csrfHeader } : undefined,
  } as any;
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  // @ts-expect-error — test-only override
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) =>
    handler(url, init),
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetBaseUrl();
  delete process.env.INTERNAL_API_KEY;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InternalApiError', () => {
  it('has name, message, status, and body', () => {
    const err = new InternalApiError('not found', 404, { error: 'nope' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InternalApiError);
    expect(err.name).toBe('InternalApiError');
    expect(err.message).toBe('not found');
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ error: 'nope' });
  });
});

describe('apiGet', () => {
  it('resolves base URL from config and calls /api/v2/<path>', async () => {
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url;
      return Response.json({ ok: true });
    });

    const result = await apiGet(makeReq(), '/servers');
    expect(capturedUrl).toMatch(/\/api\/v2\/servers$/);
    expect(result).toEqual({ ok: true });
  });

  it('does not set Content-Type for GET', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiGet(makeReq(), '/servers');
    expect(capturedHeaders['content-type']).toBeUndefined();
  });
});

describe('apiPost', () => {
  it('sends JSON body and sets Content-Type', async () => {
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedBody = init.body as string;
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({ created: true });
    });

    const result = await apiPost(makeReq(), '/servers', { name: 'test' });
    expect(capturedBody).toBe(JSON.stringify({ name: 'test' }));
    expect(capturedHeaders['content-type']).toBe('application/json');
    expect(result).toEqual({ created: true });
  });

  it('forwards CSRF token header for mutations', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiPost(makeReq({}, 'abc123'), '/servers', {});
    expect(capturedHeaders['x-csrf-token']).toBe('abc123');
  });

  it('forwards session cookies when no API key is set', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiPost(
      makeReq({ 'connect.sid': 'sess123', 'psifi.x-csrf-token': 'salt456' }),
      '/servers',
      {},
    );
    expect(capturedHeaders['cookie']).toContain('connect.sid=sess123');
    expect(capturedHeaders['cookie']).toContain('psifi.x-csrf-token=salt456');
    expect(capturedHeaders['authorization']).toBeUndefined();
  });
});

describe('apiPut', () => {
  it('sends PUT with body', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    mockFetch((_url, init) => {
      capturedMethod = init.method ?? '';
      capturedBody = init.body as string;
      return Response.json({});
    });

    await apiPut(makeReq(), '/servers/1', { name: 'updated' });
    expect(capturedMethod).toBe('PUT');
    expect(capturedBody).toBe(JSON.stringify({ name: 'updated' }));
  });
});

describe('apiPatch', () => {
  it('sends PATCH with body', async () => {
    let capturedMethod = '';
    mockFetch((_url, init) => {
      capturedMethod = init.method ?? '';
      return Response.json({});
    });

    await apiPatch(makeReq(), '/servers/1', { name: 'patched' });
    expect(capturedMethod).toBe('PATCH');
  });
});

describe('apiDelete', () => {
  it('sends DELETE without body', async () => {
    let capturedMethod = '';
    let capturedBody: string | undefined;
    mockFetch((_url, init) => {
      capturedMethod = init.method ?? '';
      capturedBody = init.body as string | undefined;
      return Response.json({});
    });

    await apiDelete(makeReq(), '/servers/1');
    expect(capturedMethod).toBe('DELETE');
    expect(capturedBody).toBeUndefined();
  });
});

describe('API key auth', () => {
  it('uses Bearer auth when INTERNAL_API_KEY is set', async () => {
    process.env.INTERNAL_API_KEY = 'test-api-key-123';
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiGet(makeReq(), '/servers');
    expect(capturedHeaders['authorization']).toBe('Bearer test-api-key-123');
    expect(capturedHeaders['cookie']).toBeUndefined();
  });

  it('does not forward CSRF token when using API key', async () => {
    process.env.INTERNAL_API_KEY = 'test-api-key-123';
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiPost(makeReq({}, 'csrf-token'), '/servers', {});
    expect(capturedHeaders['x-csrf-token']).toBeUndefined();
    expect(capturedHeaders['authorization']).toBe('Bearer test-api-key-123');
  });
});

describe('CSRF token extraction', () => {
  it('extracts CSRF from x-csrf-token header', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiPost(makeReq({}, 'header-token'), '/servers', {});
    expect(capturedHeaders['x-csrf-token']).toBe('header-token');
  });

  it('extracts CSRF from _csrf body field', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    const req = makeReq();
    req.body = { _csrf: 'body-token' };
    await apiPost(req, '/servers', {});
    expect(capturedHeaders['x-csrf-token']).toBe('body-token');
  });

  it('does not forward CSRF token for GET requests', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch((_url, init) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return Response.json({});
    });

    await apiGet(makeReq({}, 'should-not-appear'), '/servers');
    expect(capturedHeaders['x-csrf-token']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('throws InternalApiError on 4xx response', async () => {
    mockFetch(() => Response.json({ error: 'Not Found' }, { status: 404 }));

    await expect(apiGet(makeReq(), '/servers/999')).rejects.toThrow(
      InternalApiError,
    );
    try {
      await apiGet(makeReq(), '/servers/999');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalApiError);
      expect((err as InternalApiError).status).toBe(404);
      expect((err as InternalApiError).body).toEqual({ error: 'Not Found' });
    }
  });

  it('throws InternalApiError on 5xx response', async () => {
    mockFetch(() =>
      Response.json({ error: 'Internal Server Error' }, { status: 500 }),
    );

    try {
      await apiGet(makeReq(), '/servers');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalApiError);
      expect((err as InternalApiError).status).toBe(500);
    }
  });

  it('throws InternalApiError on network failure', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });

    try {
      await apiGet(makeReq(), '/servers');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalApiError);
      expect((err as InternalApiError).status).toBe(0);
    }
  });

  it('throws InternalApiError with status 408 on timeout', async () => {
    mockFetch((_url, init) => {
      const signal = init.signal;
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
        // Never resolves — simulates a hanging request
      });
    });

    try {
      await apiGet(makeReq(), '/servers', { timeoutMs: 100 });
    } catch (err) {
      expect(err).toBeInstanceOf(InternalApiError);
      expect((err as InternalApiError).status).toBe(408);
      expect((err as InternalApiError).message).toContain('timed out');
    }
  });
});

describe('resetBaseUrl', () => {
  it('clears the cached base URL', () => {
    resetBaseUrl();
    // No error — just ensures it doesn't throw
    expect(true).toBe(true);
  });
});
