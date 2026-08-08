import { describe, it, expect } from 'vitest';
import { redact } from '../../src/handlers/logger';

describe('logger secret redaction', () => {
  it('redacts common password/token key-value pairs', () => {
    const input = JSON.stringify({ user: 'admin', password: 'hunter2', apiKey: 'sk-1234567890' });
    const out = redact(input);
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('sk-1234567890');
    expect(out).toContain('***REDACTED***');
  });

  it('redacts authorization headers, including Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret';
    const out = redact(input);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiI');
    expect(out).toContain('***REDACTED***');
  });

  it('redacts secrets in query strings', () => {
    const input = 'GET /api/?token=abc123&api_key=xyz';
    const out = redact(input);
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('xyz');
    expect(out).toContain('token=');
  });

  it('redacts secrets inside object util.inspect output', () => {
    const obj = { connection: { password: 'mysqlpass', host: 'db.internal' } };
    const inspected = require('util').inspect(obj, { depth: 5 });
    const out = redact(inspected);
    expect(out).not.toContain('mysqlpass');
    expect(out).toContain('db.internal');
    expect(out).toContain('***REDACTED***');
  });

  it('does not mangle ordinary log text', () => {
    const input = 'Server 42 started on node nyc1:80 with 1 CPU';
    expect(redact(input)).toBe(input);
  });
});