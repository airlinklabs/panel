import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../src/db', () => ({
  default: {
    apiKey: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

import prisma from '../src/db';
import logger from '../src/handlers/logger';
import { legacyApiValidator } from '../src/modules/api/Alternative/api';

const mockPrisma = vi.mocked(prisma);
const mockLogger = vi.mocked(logger);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReq(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return req;
}

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

async function run(authHeader?: string) {
  const req = makeReq(authHeader);
  const res = makeRes();
  const next = vi.fn();
  await legacyApiValidator(req, res, next);
  return { req, res, next };
}

describe('legacyApiValidator (Alternative application API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.settings.findUnique.mockResolvedValue({ id: 1, hashApiKeys: false });
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the legacy 401 body for a missing Authorization header', async () => {
    const { res, next } = await run();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthorized: Missing or malformed Authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns the legacy 401 body for a malformed Authorization header', async () => {
    const { res, next } = await run('Bearer');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe(
      'Unauthorized: Missing or malformed Authorization header',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches req.apiKey for a valid active key (plaintext lookup)', async () => {
    const keyRow = { id: 1, key: 'valid-secret', active: true, permissions: '[]' };
    mockPrisma.apiKey.findUnique.mockResolvedValue(keyRow);

    const { req, res, next } = await run('Bearer valid-secret');

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.apiKey).toEqual(keyRow);
    expect(res.statusCode).toBe(0);
    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { key: 'valid-secret' },
    });
  });

  it('translates an invalid key to the legacy 401 body and never logs the raw key', async () => {
    const secret = 'super-secret-submitted-key';
    const { res, next } = await run(`Bearer ${secret}`);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized: Invalid API Key' });
    expect(next).not.toHaveBeenCalled();

    const logged = mockLogger.error.mock.calls.flat();
    expect(logged.some((arg) => String(arg).includes(secret))).toBe(false);
  });

  it('translates an inactive key to the legacy 401 body', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 1,
      key: 'inactive-key',
      active: false,
      permissions: '[]',
    });

    const { res, next } = await run('Bearer inactive-key');

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized: Invalid API Key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('looks up the SHA-256 hash of the submitted key when hashApiKeys is on', async () => {
    mockPrisma.settings.findUnique.mockResolvedValue({
      id: 1,
      hashApiKeys: true,
    });
    const hashed = sha256('raw-very-secret');
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 7,
      key: hashed,
      active: true,
      permissions: '[]',
    });

    const { req, next } = await run('Bearer raw-very-secret');

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.apiKey.key).toBe(hashed);
    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { key: hashed },
    });
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalledWith({
      where: { key: 'raw-very-secret' },
    });
  });
});