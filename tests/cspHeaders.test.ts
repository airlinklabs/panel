import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readHtml(): string {
  // We don't start the server here; instead we verify the helmet config
  // in app.ts directly by inspecting the source. For runtime CSP tests
  // the Playwright smoke suite covers header assertions.
  return fs.readFileSync(path.join(ROOT, 'src/app.ts'), 'utf8');
}

describe('CSP configuration in app.ts', () => {
  const src = readHtml();

  it('uses nonce-based script-src in production', () => {
    expect(src).toContain("'nonce-${nonce}'");
    expect(src).toContain("'strict-dynamic'");
  });

  it('sets script-src-attr to unsafe-inline (documented fallback for inline handlers)', () => {
    expect(src).toContain("scriptSrcAttr: ['\\'unsafe-inline\\'']");
  });

  it('sets frame-ancestors to none', () => {
    expect(src).toContain("frameAncestors: ['\\'none\\'']");
  });

  it('sets object-src to none', () => {
    expect(src).toContain("objectSrc: ['\\'none\\'']");
  });

  it('sets base-uri to self', () => {
    expect(src).toContain("baseUri: ['\\'self\\'']");
  });

  it('sets form-action to self', () => {
    expect(src).toContain("formAction: ['\\'self\\'']");
  });

  it('only applies CSP in production mode', () => {
    expect(src).toContain('contentSecurityPolicy: isProduction');
  });

  it('generates a fresh nonce per request', () => {
    expect(src).toContain('crypto.randomBytes(16).toString');
  });
});

describe('Security headers in daemon hmac.ts', () => {
  const hmacSrc = fs.readFileSync(path.join(ROOT, '..', 'daemon', 'src', 'security', 'hmac.ts'), 'utf8');

  it('sets X-Content-Type-Options to nosniff', () => {
    expect(hmacSrc).toContain("'X-Content-Type-Options'");
    expect(hmacSrc).toContain("'nosniff'");
  });

  it('sets X-Frame-Options to DENY', () => {
    expect(hmacSrc).toContain("'X-Frame-Options'");
    expect(hmacSrc).toContain("'DENY'");
  });

  it('sets Referrer-Policy to no-referrer', () => {
    expect(hmacSrc).toContain("'Referrer-Policy'");
    expect(hmacSrc).toContain("'no-referrer'");
  });

  it('sets Cache-Control to no-store', () => {
    expect(hmacSrc).toContain("'Cache-Control'");
    expect(hmacSrc).toContain("'no-store'");
  });
});
