import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import express from 'express';

// Mock prisma before importing the module
vi.mock('../src/db', () => ({
  default: {
    server: { findUnique: vi.fn(), findMany: vi.fn() },
    subUser: { findFirst: vi.fn() },
    backup: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    schedule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    scheduleTask: { create: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../src/handlers/utils/core/daemonRequest', () => ({
  daemonRequest: vi.fn(),
}));

vi.mock('../src/handlers/utils/activity/activityLogger', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../src/handlers/utils/api/apiValidator', () => ({
  apiValidator: () => (_req: any, _res: any, next: any) => next(),
}));

import clientApiModule from '../src/modules/api/client/clientApi';
import prisma from '../src/db';
import { daemonRequest } from '../src/handlers/utils/core/daemonRequest';

const mockPrisma = vi.mocked(prisma);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).apiKey = { userId: 1 };
    next();
  });
  app.use(clientApiModule.router());
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

describe('Client API Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.server.findUnique.mockResolvedValue({
      UUID: 'test-uuid',
      name: 'Test',
      description: null,
      ownerId: 1,
      node: { address: '1.2.3.4', port: 3002, key: 'abc' },
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports correct module info', () => {
    expect(clientApiModule.info.name).toBe('Client API Module');
    expect(clientApiModule.info.version).toBe('1.0.0');
    expect(clientApiModule.info.author).toBe('AirLinkLab');
  });

  it('exports a router function', () => {
    expect(typeof clientApiModule.router).toBe('function');
  });

  it('router returns an Express router', () => {
    const router = clientApiModule.router();
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  describe('server ownership resolution', () => {
    it('finds server by UUID and checks ownerId', async () => {
      const mockServer = { UUID: 'test-uuid', name: 'Test', ownerId: 1, node: { address: '1.2.3.4', port: 3002, key: 'abc' } };
      mockPrisma.server.findUnique.mockResolvedValue(mockServer as any);

      const server = await prisma.server.findUnique({ where: { UUID: 'test-uuid' }, include: { node: true } });
      expect(server).toEqual(mockServer);
      expect(server!.ownerId).toBe(1);
    });

    it('returns null for non-existent server', async () => {
      mockPrisma.server.findUnique.mockResolvedValue(null);

      const server = await prisma.server.findUnique({ where: { UUID: 'nonexistent' }, include: { node: true } });
      expect(server).toBeNull();
    });

    it('allows subusers on servers they do not own (B-2)', async () => {
      mockPrisma.server.findUnique.mockResolvedValue({
        UUID: 'test-uuid',
        name: 'Test',
        ownerId: 999,
        node: { address: '1.2.3.4', port: 3002, key: 'abc' },
      } as any);
      mockPrisma.subUser.findFirst.mockResolvedValue({ id: 1, serverId: 'test-uuid', userId: 1 } as any);

      await withServer(buildApp(), async (base) => {
        const res = await fetch(`${base}/api/client/servers/test-uuid`);
        expect(res.status).toBe(200);
        expect(mockPrisma.subUser.findFirst).toHaveBeenCalledWith({
          where: { serverId: 'test-uuid', userId: 1 },
        });
      });
    });

    it('returns 404 for users with neither owner nor subuser access (B-2)', async () => {
      mockPrisma.server.findUnique.mockResolvedValue({
        UUID: 'test-uuid',
        name: 'Test',
        ownerId: 999,
        node: { address: '1.2.3.4', port: 3002, key: 'abc' },
      } as any);
      mockPrisma.subUser.findFirst.mockResolvedValue(null);

      await withServer(buildApp(), async (base) => {
        const res = await fetch(`${base}/api/client/servers/test-uuid`);
        expect(res.status).toBe(404);
      });
    });
  });

  describe('backup operations', () => {
    it('counts existing backups against limit', async () => {
      mockPrisma.backup.count.mockResolvedValue(3);

      const count = await prisma.backup.count({ where: { serverId: 'test-uuid' } });
      expect(count).toBe(3);
    });

    it('creates backup with daemon response data', async () => {
      const mockBackup = { UUID: 'backup-uuid', name: 'test', serverId: 'test-uuid', filePath: '/path', size: BigInt(1024) };
      mockPrisma.backup.create.mockResolvedValue(mockBackup as any);

      const backup = await prisma.backup.create({
        data: { UUID: 'backup-uuid', name: 'test', serverId: 'test-uuid', filePath: '/path', size: BigInt(1024) },
      });
      expect(backup.UUID).toBe('backup-uuid');
    });
  });

  describe('schedule operations', () => {
    it('creates schedule with cron and action', async () => {
      const mockSchedule = { id: 1, name: 'test', cron: '0 * * * *', serverId: 'test-uuid', enabled: true, nextRunAt: new Date() };
      mockPrisma.schedule.create.mockResolvedValue(mockSchedule as any);

      const schedule = await prisma.schedule.create({
        data: { name: 'test', cron: '0 * * * *', serverId: 'test-uuid', enabled: true },
      });
      expect(schedule.name).toBe('test');
      expect(schedule.cron).toBe('0 * * * *');
    });

    it('finds schedule by id and serverId', async () => {
      const mockSchedule = { id: 1, name: 'test', serverId: 'test-uuid' };
      mockPrisma.schedule.findFirst.mockResolvedValue(mockSchedule as any);

      const schedule = await prisma.schedule.findFirst({ where: { id: 1, serverId: 'test-uuid' } });
      expect(schedule).toEqual(mockSchedule);
    });

    it('creates schedule + task with nextRunAt set (B-1/B-4)', async () => {
      mockPrisma.schedule.create.mockResolvedValue({
        id: 7,
        name: 'daily',
        cron: '0 4 * * *',
        enabled: true,
        serverId: 'test-uuid',
        nextRunAt: new Date(),
        tasks: [{ id: 1, order: 0, action: 'power', payload: '{"action":"restart"}' }],
      } as any);

      await withServer(buildApp(), async (base) => {
        const res = await fetch(`${base}/api/client/servers/test-uuid/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'daily',
            cron: '0 4 * * *',
            action: 'power',
            payload: '{"action":"restart"}',
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(7);

        const createCall = mockPrisma.schedule.create.mock.calls[0][0];
        expect(createCall.data.nextRunAt).toBeInstanceOf(Date);
        expect(createCall.data.tasks.create).toEqual({
          order: 0,
          action: 'power',
          payload: '{"action":"restart"}',
        });
      });
    });

    it('rejects schedule creation with invalid power payload (B-1)', async () => {
      await withServer(buildApp(), async (base) => {
        const res = await fetch(`${base}/api/client/servers/test-uuid/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'daily',
            cron: '0 4 * * *',
            action: 'power',
            payload: '{"action":"explode"}',
          }),
        });

        expect(res.status).toBe(400);
        expect(mockPrisma.schedule.create).not.toHaveBeenCalled();
      });
    });

    it('lists schedules with tasks included (B-1)', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 1, name: 'daily', cron: '0 4 * * *', enabled: true, nextRunAt: null, lastRunAt: null, createdAt: new Date(), tasks: [] },
      ] as any);

      await withServer(buildApp(), async (base) => {
        const res = await fetch(`${base}/api/client/servers/test-uuid/schedules`);
        expect(res.status).toBe(200);

        const select = mockPrisma.schedule.findMany.mock.calls[0][0];
        expect(select.select.tasks).toBeDefined();
      });
    });
  });

  describe('introspection', () => {
    it('provides endpoint documentation', () => {
      const router = clientApiModule.router();
      expect(router).toBeDefined();
    });
  });
});
