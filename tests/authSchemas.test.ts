import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  loginSchema,
  registerSchema,
  authValidationErrorCode,
} from '../src/modules/auth/schemas';

describe('loginSchema', () => {
  it('accepts a valid identifier + password', () => {
    const r = loginSchema.safeParse({ identifier: 'admin@example.com', password: 'secret' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ identifier: 'admin@example.com', password: 'secret' });
    }
  });

  it('rejects missing fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'x' }).success).toBe(false);
  });

  it('rejects empty strings', () => {
    const r = loginSchema.safeParse({ identifier: '', password: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.every((i) => i.message === 'missing')).toBe(true);
    }
  });
});

describe('registerSchema', () => {
  it('accepts valid credentials', () => {
    const r = registerSchema.safeParse({
      email: 'user@example.com',
      username: 'alice',
      password: 'password1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing credentials with the missing code', () => {
    const r = registerSchema.safeParse({ email: 'a@b.co' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(authValidationErrorCode(r.error.issues)).toBe('missing');
    }
  });

  it('rejects invalid email or password with invalid_input', () => {
    const r = registerSchema.safeParse({
      email: 'not-an-email',
      username: 'alice',
      password: 'password1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(authValidationErrorCode(r.error.issues)).toBe('invalid_input');
    }

    const r2 = registerSchema.safeParse({
      email: 'user@example.com',
      username: 'alice',
      password: 'short',
    });
    expect(r2.success).toBe(false);
    if (!r2.success) {
      expect(authValidationErrorCode(r2.error.issues)).toBe('invalid_input');
    }
  });

  it('rejects invalid username with invalid_username', () => {
    const r = registerSchema.safeParse({
      email: 'user@example.com',
      username: 'a b c',
      password: 'password1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(authValidationErrorCode(r.error.issues)).toBe('invalid_username');
    }
  });

  it('prefers the missing code over format codes', () => {
    const r = registerSchema.safeParse({ email: 'not-an-email', username: 'alice' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(authValidationErrorCode(r.error.issues)).toBe('missing');
    }
  });
});

describe('auth route validation boundary', () => {
  let app: express.Express;
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetModules();
  });

  it('login redirects to invalid_credentials for malformed body', async () => {
    vi.doMock('../src/db', () => ({
      default: {
        settings: { findUnique: vi.fn().mockResolvedValue({}) },
        users: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn().mockResolvedValue(1) },
      },
    }));
    vi.doMock('../src/handlers/logger', () => ({
      default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
    }));

    const authServiceModule = (await import('../src/modules/auth/authService')).default;
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(authServiceModule.router());
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const resp = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'identifier=&password=',
      redirect: 'manual',
    });

    expect(resp.status).toBe(302);
    expect(resp.headers.get('location')).toBe('/login?err=invalid_credentials');
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
