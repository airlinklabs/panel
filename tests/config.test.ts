import { describe, it, expect } from 'vitest';
import {
  isUnsafeSessionSecret,
  resolveSessionSecret,
  parsePort,
  getConfig,
} from '../src/config';

describe('config: session secret validation', () => {
  it('rejects missing, placeholder, and known-insecure secrets', () => {
    expect(isUnsafeSessionSecret(undefined)).toBe(true);
    expect(isUnsafeSessionSecret('')).toBe(true);
    expect(isUnsafeSessionSecret('change_me')).toBe(true);
    expect(isUnsafeSessionSecret('dev-only-insecure-secret-change-me')).toBe(true);
  });

  it('rejects short secrets that cannot hold enough entropy', () => {
    expect(isUnsafeSessionSecret('a'.repeat(16))).toBe(true);
    expect(isUnsafeSessionSecret('a'.repeat(31))).toBe(true);
  });

  it('accepts a strong, panel-style hex secret', () => {
    const secret = '5848abfa9f716bb1747dd321e3017b18c0c30ace38c6cd812c2290c6e92decab';
    expect(isUnsafeSessionSecret(secret)).toBe(false);
  });

  it('returns the secret as-is when it is safe', () => {
    const secret = 'x'.repeat(64);
    expect(resolveSessionSecret(secret, true)).toBe(secret);
  });
});

describe('config: resolveSessionSecret fail-fast behaviour', () => {
  it('throws in production when the secret is missing', () => {
    expect(() => resolveSessionSecret(undefined, true)).toThrow(/SESSION_SECRET/);
  });

  it('throws in production for a placeholder secret', () => {
    expect(() => resolveSessionSecret('change_me', true)).toThrow(/SESSION_SECRET/);
  });

  it('generates an ephemeral secret in development instead of failing', () => {
    const secret = resolveSessionSecret(undefined, false);
    expect(secret).toHaveLength(64);
    expect(secret).not.toBe(resolveSessionSecret(undefined, false));
  });
});

describe('config: parsePort', () => {
  it('falls back to 3000 for missing/empty input', () => {
    expect(parsePort(undefined)).toBe(3000);
    expect(parsePort('')).toBe(3000);
  });

  it('parses valid ports', () => {
    expect(parsePort('8080')).toBe(8080);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects out-of-range and non-numeric values', () => {
    expect(parsePort('0')).toBe(3000);
    expect(parsePort('65536')).toBe(3000);
    expect(parsePort('abc')).toBe(3000);
    expect(parsePort('12.5')).toBe(3000);
  });
});

describe('config: getConfig', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('derives isHttps from URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'z'.repeat(64);
    process.env.URL = 'https://panel.example.com';
    process.env.PORT = '8443';
    process.env.NAME = 'Test Panel';

    const cfg = getConfig();
    expect(cfg.isHttps).toBe(true);
    expect(cfg.isProduction).toBe(true);
    expect(cfg.port).toBe(8443);
    expect(cfg.name).toBe('Test Panel');
  });

  it('marks non-https URLs as not-https and defaults name', () => {
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = 'z'.repeat(64);
    process.env.URL = 'http://localhost:3000';
    delete process.env.NAME;

    const cfg = getConfig();
    expect(cfg.isHttps).toBe(false);
    expect(cfg.name).toBe('AirLink');
  });

  it('keeps HTTP deployments usable even in production mode', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'z'.repeat(64);
    process.env.URL = 'http://127.0.0.1:3000';

    expect(getConfig().isProduction).toBe(true);
    expect(getConfig().isHttps).toBe(false);
  });

  it('fails hard in production with no secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    expect(() => getConfig()).toThrow(/SESSION_SECRET/);
  });
});
