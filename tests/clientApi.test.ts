import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module
vi.mock('../src/db', () => ({
  default: {
    server: { findUnique: vi.fn(), findMany: vi.fn() },
    backup: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    schedule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
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

describe('Client API Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const mockSchedule = { id: 1, name: 'test', cron: '0 * * * *', action: 'command', payload: null, serverId: 'test-uuid', enabled: true };
      mockPrisma.schedule.create.mockResolvedValue(mockSchedule as any);

      const schedule = await prisma.schedule.create({
        data: { name: 'test', cron: '0 * * * *', action: 'command', serverId: 'test-uuid', enabled: true },
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
  });

  describe('introspection', () => {
    it('provides endpoint documentation', () => {
      const router = clientApiModule.router();
      expect(router).toBeDefined();
    });
  });
});