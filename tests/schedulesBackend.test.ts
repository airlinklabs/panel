import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import express, { Router } from 'express';

vi.mock('../src/db', () => ({
  default: {
    users: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    schedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    scheduleTask: { count: vi.fn(), create: vi.fn() },
    backup: { create: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/handlers/utils/core/daemonRequest', () => ({
  daemonRequest: vi.fn(),
}));

import prisma from '../src/db';
import { daemonRequest } from '../src/handlers/utils/core/daemonRequest';
import { registerScheduleRoutes } from '../src/modules/user/server/schedules';
import { runSchedule } from '../src/handlers/schedulerWorker';

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);

interface FakeSession {
  user?: { id: number; isAdmin?: boolean };
  destroy: (cb: (err?: Error | null) => void) => void;
}

function stubSession(user?: { id: number; isAdmin?: boolean }) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const session: FakeSession = {
      user: user ? { ...user } : undefined,
      destroy: vi.fn((cb) => cb(null)),
    };
    (req as any).session = session;
    (req as any).sessionUserHandle = session;
    next();
  };
}

const adminUser = { id: 1, isAdmin: true, username: 'admin', email: 'a@b.c', description: '' };
const serverFixture = {
  UUID: 'srv-abc',
  name: 'test',
  ownerId: adminUser.id,
  node: { address: '127.0.0.1', port: 8080, key: 'nodekey' },
  image: { info: '{}' },
  Suspended: false,
  owner: adminUser,
};

const schedNode = {
  UUID: 'srv-abc',
  Suspended: false,
  image: {},
  node: { address: '127.0.0.1', port: 8080, key: 'nodekey' },
};

function scheduleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    serverId: 'srv-abc',
    name: 'My schedule',
    cron: '*/5 * * * *',
    timeOffset: 0,
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    server: schedNode,
    tasks: [],
    ...overrides,
  };
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(stubSession({ id: adminUser.id, isAdmin: true }));
  const router = Router();
  registerScheduleRoutes(router);
  app.use(router);
  return app;
}

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('schedules manual run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.server.findUnique.mockResolvedValue(serverFixture as any);
    mockDaemonRequest.mockResolvedValue({ status: 200, data: { message: 'ok' } } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST .../run on a schedule with tasks updates and persists lastRunAt AND nextRunAt in the future', async () => {
    const task = { id: 1, action: 'command', payload: JSON.stringify({ command: 'echo hi' }), timeOffset: 0 };
    const sched = scheduleFixture({ tasks: [task] });
    mockPrisma.schedule.findFirst.mockResolvedValue(sched as any);
    mockPrisma.schedule.update.mockImplementation(async ({ data }: any) => data);

    const before = Date.now();
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules/7/run`, { method: 'POST' });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true });
    });

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    const data = mockPrisma.schedule.update.mock.calls[0][0]?.data as any;
    expect(data.lastRunAt).toBeInstanceOf(Date);
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(data.nextRunAt.getTime()).toBeGreaterThan(before);
    expect(data.nextRunAt.getTime()).toBeGreaterThan(data.lastRunAt.getTime());
  });

  it('POST .../run on a schedule with zero tasks returns 400', async () => {
    const sched = scheduleFixture({ tasks: [] });
    mockPrisma.schedule.findFirst.mockResolvedValue(sched as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules/abc/run`, { method: 'POST' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    });

    expect(mockDaemonRequest).not.toHaveBeenCalled();
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });

  it('POST .../run returns 500 and does NOT advance lastRunAt when the daemon fails', async () => {
    const task = { id: 1, action: 'command', payload: JSON.stringify({ command: 'echo hi' }), timeOffset: 0 };
    const sched = scheduleFixture({ tasks: [task] });
    mockPrisma.schedule.findFirst.mockResolvedValue(sched as any);
    mockDaemonRequest.mockResolvedValue({ status: 500, data: { error: 'boom' } } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules/7/run`, { method: 'POST' });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('failed');
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors[0]).toContain('boom');
    });

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });
});

describe('schedules validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.server.findUnique.mockResolvedValue(serverFixture as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /server/:id/schedules with invalid cron returns 400 and is not persisted', async () => {
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'bad', cron: 'not-a-cron' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    });

    expect(mockPrisma.schedule.create).not.toHaveBeenCalled();
  });

  it('POST /server/:id/schedules persists enabled: true by default', async () => {
    mockPrisma.schedule.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'nightly', cron: '0 0 * * *' }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });

    expect(mockPrisma.schedule.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.schedule.create.mock.calls[0][0].data as any;
    expect(data.enabled).toBe(true);
  });

  it('POST .../tasks with an action outside {command,power,backup} returns 400', async () => {
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/schedules/5/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'frobnicate', payload: { x: 1 } }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('command, power, backup');
    });
  });
});

describe('scheduled backup recording (runSchedule)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function backupSchedule(payload: Record<string, unknown> = { name: 'nightly' }) {
    return scheduleFixture({
      tasks: [{ id: 2, action: 'backup', payload: JSON.stringify(payload), timeOffset: 0 }],
    });
  }

  it('runSchedule records a Backup row from a successful daemon backup response', async () => {
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        backup: { uuid: 'bk-111', name: 'nightly', filePath: 'backups/srv-abc/bk-111-backup.tar.gz', size: 12345, checksum: 'abc123' },
      },
    } as any);
    mockPrisma.backup.create.mockResolvedValue({ UUID: 'bk-111' } as any);

    await runSchedule(backupSchedule());

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    const opts = mockDaemonRequest.mock.calls[0][0];
    expect(opts.path).toBe('/container/backup');
    expect(opts.body).toEqual({ id: 'srv-abc', name: 'nightly' });

    expect(mockPrisma.backup.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.backup.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      UUID: 'bk-111',
      name: 'nightly',
      serverId: 'srv-abc',
      filePath: 'backups/srv-abc/bk-111-backup.tar.gz',
      checksum: 'abc123',
      airlinkCloudId: null,
    });
    expect(data.size).toEqual(BigInt(12345));
  });

  it('runSchedule with a failing daemon backup response (success:false) does NOT create a Backup row', async () => {
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      data: { success: false, error: 'no disk space' },
    } as any);

    await runSchedule(backupSchedule());

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    expect(mockPrisma.backup.create).not.toHaveBeenCalled();
  });

  it('runSchedule falls back to a scheduled-<timestamp> name when the payload has no name', async () => {
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        backup: { uuid: 'bk-222', name: 'scheduled-1', filePath: 'backups/srv-abc/bk-222-backup.tar.gz', size: 0, checksum: null },
      },
    } as any);
    mockPrisma.backup.create.mockResolvedValue({ UUID: 'bk-222' } as any);

    await runSchedule(backupSchedule({}));

    const data = mockPrisma.backup.create.mock.calls[0][0].data;
    expect(data.name).toMatch(/^scheduled-\d+$/);
    expect(data.size).toEqual(BigInt(0));
    expect(data.checksum).toBeNull();
  });
});
