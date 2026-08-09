import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import http from 'http';
import { AddressInfo } from 'net';
import { isCsrfExempt } from '../src/handlers/utils/security/csrfRouting';

// Imported after env is configured so the middleware uses development cookie
// settings (secure:false) regardless of import order elsewhere.
process.env.NODE_ENV = 'development';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-test-secret';
const { csrfProtection, addCsrfTokenToLocals, handleCsrfError } =
  await import('../src/handlers/utils/security/csrfProtection');

function buildApp(): express.Express {
  const app = express();
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    }),
  );
  app.use(express.json());
  app.use((req, res, next) => {
    if (isCsrfExempt(req)) return next();
    csrfProtection(req, res, next);
  });
  app.use((req, res, next) => {
    if (isCsrfExempt(req)) return next();
    addCsrfTokenToLocals(req, res, next);
  });
  app.use(handleCsrfError);

  // Session-authenticated route that MUST be CSRF-protected.
  app.post('/api/folders', (_req, res) => res.json({ ok: true }));
  // Bearer-only mount that is exempt.
  app.post('/api/v1/test', (_req, res) => res.json({ ok: true }));
  // Exposes the CSRF token for the session (protected route, so token set).
  app.get('/csrf-meta', (_req, res) => res.json({ token: res.locals.csrfToken }));
  return app;
}

let server: http.Server;
let baseUrl: string;
let cookies: string;

beforeAll(async () => {
  const app = buildApp();
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  cookies = '';
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('request-level CSRF enforcement', () => {
  it('returns 403 for a tokenless POST to a session-authenticated api route', async () => {
    const res = await fetch(`${baseUrl}/api/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(403);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      cookies = setCookie.split(';')[0];
    }
  });

  it('accepts the same POST when a valid CSRF token and its cookie are sent', async () => {
    // Get a token bound to this session (the response also sets the
    // double-csrf cookie the token is tied to).
    const meta = await fetch(`${baseUrl}/csrf-meta`, {
      headers: cookies ? { cookie: cookies } : {},
    });
    expect(meta.status).toBe(200);
    const setCookie = meta.headers.get('set-cookie');
    if (setCookie) {
      const merged = new Set([...cookies.split('; ').filter(Boolean), ...setCookie.split('; ').filter((c) => c.includes('='))]);
      cookies = [...merged].join('; ');
    }
    const { token } = (await meta.json()) as { token?: string };
    expect(typeof token).toBe('string');
    expect(token?.length).toBeGreaterThan(0);

    const res = await fetch(`${baseUrl}/api/folders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: cookies,
        'csrf-token': token as string,
      },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('does not require a CSRF token on the bearer-only /api/v1 mount', async () => {
    const res = await fetch(`${baseUrl}/api/v1/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });
});
