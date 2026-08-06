import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Server as HttpServer } from 'node:http';
import { createHash } from 'node:crypto';

// Mock prisma, logger, activity logger, and the key generator before importing
// the modules under test.
vi.mock('../src/db', () => ({
  default: {
    users: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    server: { count: vi.fn() },
    session: { deleteMany: vi.fn() },
    loginHistory: { deleteMany: vi.fn() },
    apiKey: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: { findUnique: vi.fn(), findFirst: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/handlers/utils/activity/activityLogger', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../src/utils/apiKey', () => ({
  generateApiKey: vi.fn(),
}));

import prisma from '../src/db';
import bcrypt from 'bcryptjs';
import usersModule from '../src/modules/admin/users';
import apiKeysModule from '../src/modules/admin/apiKeys';
import { apiValidator } from '../src/handlers/utils/api/apiValidator';
import { generateApiKey } from '../src/utils/apiKey';

const mockPrisma = vi.mocked(prisma);
const mockGenerateApiKey = vi.mocked(generateApiKey);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const adminUser = {
  id: 1,
  isAdmin: true,
  totpEnabled: true,
  username: 'admin',
  email: 'admin@air.link',
  permissions: '[]',
};
const otherAdmin = {
  id: 3,
  isAdmin: true,
  totpEnabled: true,
  username: 'boss',
  email: 'boss@air.link',
  permissions: '[]',
};
const regularUser = {
  id: 2,
  isAdmin: false,
  totpEnabled: true,
  username: 'player',
  email: 'player@air.link',
  permissions: '[]',
};

function stubSession(user: { id: number; isAdmin?: boolean }) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).session = { user: { ...user } };
    next();
  };
}

function buildApp(router: ReturnType<typeof usersModule.router> | ReturnType<typeof usersModule.router>[]): express.Express {
  const app = express();
  app.use(express.json());
  app.use(stubSession({ id: 1, isAdmin: true }));
  const routers = Array.isArray(router) ? router : [router];
  routers.forEach((r) => app.use('/', r));
  return app;
}

// Map of user-id -> record so the admin *session* lookup (id 1) is not clobbered
// when a test targets a different user.
function stubUsersWith(byId: Record<number, any>) {
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => byId[where?.id] ?? null);
}

let listener: HttpServer | undefined;

async function request(app: express.Express, url: string, init?: RequestInit): Promise<Response> {
  if (!listener) {
    listener = app.listen(0);
    await new Promise<void>((resolve) => listener!.once('listening', resolve));
  }
  const { port } = listener.address() as { port: number };
  return fetch(`http://127.0.0.1:${port}${url}`, { ...init, redirect: 'manual' });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (listener) {
    listener.close();
    listener = undefined;
  }
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
    where?.id === 1 ? adminUser : where?.id === regularUser.id ? regularUser : null,
  );
  mockPrisma.users.count.mockResolvedValue(1);
  mockPrisma.server.count.mockResolvedValue(0);
  mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.loginHistory.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.apiKey.count.mockResolvedValue(0);
  mockPrisma.settings.findUnique.mockResolvedValue(null);
});

describe('admin users CRUD', () => {
  const usersApp = () => buildApp(usersModule.router());

  it('create hashes the password with bcrypt (never stores plaintext)', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    const createSpy = mockPrisma.users.create.mockResolvedValue({ id: 9 });
    const password = 'CorrectHorse42';

    const res = await request(usersApp(), '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@air.link', username: 'newuser', password }),
    });

    expect(res.status).toBe(200);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const data = createSpy.mock.calls[0][0].data;
    expect(data.password).not.toBe(password);
    expect(bcrypt.compareSync(password, data.password)).toBe(true);
  }, 30_000);

  it('create rejects empty username with a 400', async () => {
    const res = await request(usersApp(), '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@air.link', username: '', password: 'CorrectP1' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.create).not.toHaveBeenCalled();
  });

  it('create rejects a malformed email with a 400', async () => {
    const res = await request(usersApp(), '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', username: 'newuser', password: 'CorrectP1' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.create).not.toHaveBeenCalled();
  });

  it('create rejects a weak password with a 400', async () => {
    const res = await request(usersApp(), '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@air.link', username: 'newuser', password: 'abcdefg' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.create).not.toHaveBeenCalled();
  });

  it('create rejects a duplicate username/email with a 400', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ id: 4 });
    const res = await request(usersApp(), '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@air.link', username: 'dupuser', password: 'CorrectP1' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.create).not.toHaveBeenCalled();
  });

  it('non-admin session is blocked by the create guard (403, no prisma write)', async () => {
    const app = express();
    app.use(express.json());
    app.use(stubSession({ id: 2, isAdmin: false }));
    app.use('/', usersModule.router());
    const res = await request(app, '/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'vanity@air.link', username: 'gamer', password: 'CorrectP1', isAdmin: 'true' }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.users.create).not.toHaveBeenCalled();
  });

  it('delete blocks the admin deleting their own account (400)', async () => {
    stubUsersWith({ 1: adminUser });
    const res = await request(usersApp(), '/admin/users/delete/1', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.delete).not.toHaveBeenCalled();
  });

  it('delete blocks removing the last admin (400)', async () => {
    mockPrisma.users.count.mockResolvedValue(1);
    stubUsersWith({ 1: adminUser, 3: otherAdmin });
    const res = await request(usersApp(), '/admin/users/delete/3', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.delete).not.toHaveBeenCalled();
  });

  it('delete returns 409 when the target still owns servers', async () => {
    stubUsersWith({ 1: adminUser, 2: regularUser });
    mockPrisma.server.count.mockResolvedValue(2);
    const res = await request(usersApp(), '/admin/users/delete/2', { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(mockPrisma.users.delete).not.toHaveBeenCalled();
    expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('delete cleans sessions and login history before deleting the user', async () => {
    stubUsersWith({ 1: adminUser, 2: regularUser });
    mockPrisma.server.count.mockResolvedValue(0);
    const res = await request(usersApp(), '/admin/users/delete/2', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.loginHistory.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.users.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('update rejects a malformed email without touching the DB', async () => {
    stubUsersWith({ 1: adminUser, 2: regularUser });
    const res = await request(usersApp(), '/admin/users/update/2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('update rejects a weak password without touching the DB', async () => {
    stubUsersWith({ 1: adminUser, 2: regularUser });
    const res = await request(usersApp(), '/admin/users/update/2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'short' }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('update cannot demote the last remaining admin (400)', async () => {
    mockPrisma.users.count.mockResolvedValue(1);
    stubUsersWith({ 1: adminUser, 3: otherAdmin });
    const res = await request(usersApp(), '/admin/users/update/3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: false }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('update cannot strip the session user of their own admin role (400)', async () => {
    mockPrisma.users.count.mockResolvedValue(2);
    stubUsersWith({ 1: adminUser });
    const res = await request(usersApp(), '/admin/users/update/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: false }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('non-admin session is rejected by the update guard (403, no prisma write)', async () => {
    const app = express();
    app.use(express.json());
    app.use(stubSession({ id: 2, isAdmin: false }));
    app.use('/', usersModule.router());
    const res = await request(app, '/admin/users/update/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ username: 'sneaky' }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});

describe('admin API-key CRUD + validator consistency', () => {
  const apiKeyApp = () => buildApp(apiKeysModule.router());
  const FIXED_RAW = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';

  function setupCreate(useHash: boolean) {
    mockGenerateApiKey.mockReturnValue(FIXED_RAW);
    mockPrisma.settings.findUnique.mockResolvedValue({ hashApiKeys: useHash });
    mockPrisma.apiKey.count.mockResolvedValue(0);
    mockPrisma.apiKey.create.mockResolvedValue({ id: 5 });
  }

  it('create stores a SHA-256 digest when hashApiKeys=true (list never sees the raw key)', async () => {
    setupCreate(true);
    await request(apiKeyApp(), '/admin/apikeys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'k' }),
    });
    const stored = mockPrisma.apiKey.create.mock.calls[0][0].data.key;
    expect(stored).toBe(sha256(FIXED_RAW));
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(FIXED_RAW);
  });

  it('create stores the raw key when hashApiKeys=false', async () => {
    setupCreate(false);
    await request(apiKeyApp(), '/admin/apikeys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'k' }),
    });
    const stored = mockPrisma.apiKey.create.mock.calls[0][0].data.key;
    expect(stored).toBe(FIXED_RAW);
  });

  it('invariant: the canonical validator looks up exactly what create stored, in both modes', async () => {
    for (const useHash of [true, false]) {
      vi.clearAllMocks();
      // restore essentials
      mockPrisma.users.findUnique.mockResolvedValue(adminUser);
      setupCreate(useHash);
      mockPrisma.settings.findUnique.mockResolvedValue({ hashApiKeys: useHash });

      // drive the admin create endpoint
      await request(apiKeyApp(), '/admin/apikeys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'k' }),
      });
      const storedKey = mockPrisma.apiKey.create.mock.calls[0][0].data.key;

      // feed the same raw key through the canonical validator middleware
      mockPrisma.apiKey.findUnique.mockResolvedValue({ id: 1, active: true });
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const req = { headers: { authorization: `Bearer ${FIXED_RAW}` } };
      await apiValidator()(req as any, res as any, next);

      expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledTimes(1);
      const lookupKey = mockPrisma.apiKey.findUnique.mock.calls[0][0].where.key;
      expect(lookupKey).toBe(storedKey);
    }
  });

  it('creating two keys with different raw values yields distinct stored keys (rotation semantics)', async () => {
    setupCreate(true);
    await request(apiKeyApp(), '/admin/apikeys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'k1' }),
    });
    setupCreate(false);
    const keyA = mockPrisma.apiKey.create.mock.calls[0][0].data.key;
    mockGenerateApiKey.mockReturnValue('ZZZZGHIJKLMNOPQRSTUVWXYZabcdefghij');
    await request(apiKeyApp(), '/admin/apikeys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'k2' }),
    });
    const keyB = mockPrisma.apiKey.create.mock.calls[1][0].data.key;
    expect(keyA).not.toBe(keyB);
  });

  it('toggle flips the active flag and persists it', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: 7, active: true });
    await request(apiKeyApp(), '/admin/apikeys/toggle/7', { method: 'POST' });
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { active: false, updatedAt: expect.any(Date) },
    });
  });

  it('delete of a missing key returns a clean 404', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    const res = await request(apiKeyApp(), '/admin/apikeys/delete/99', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(mockPrisma.apiKey.delete).not.toHaveBeenCalled();
  });
});