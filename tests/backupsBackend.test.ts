import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import express, { Router } from 'express';

// Mock prisma, logger and the daemon HTTP client before importing modules.
vi.mock('../src/db', () => ({
  default: {
    users: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn() },
    backup: { count: vi.fn(), create: vi.fn() },
    activityLog: { create: vi.fn() },
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

vi.mock('../src/handlers/utils/core/daemonRequest', () => ({
  daemonRequest: vi.fn(),
}));

vi.mock('../src/handlers/utils/core/s3Client', () => ({
  uploadStreamToS3: vi.fn(),
  deleteFromS3: vi.fn(),
  getS3ObjectStream: vi.fn(),
  isS3Backup: (f: string) => f.startsWith('s3:'),
  S3_KEY_PREFIX: 's3:',
}));

import prisma from '../src/db';
import { daemonRequest } from '../src/handlers/utils/core/daemonRequest';
import { AirlinkCloudClient } from '../src/handlers/utils/core/airlinkCloud';
import { uploadStreamToS3 } from '../src/handlers/utils/core/s3Client';
import { registerBackupRoutes } from '../src/modules/user/server/backups';

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);
const mockUploadStreamToS3 = vi.mocked(uploadStreamToS3);

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
  node: { address: '127.0.0.1', port: 8080, key: 'nodekey' },
  owner: adminUser,
};

const daemonLocalPath = '/data/backups/srv-abc/backup-uuid-1.tar.gz';
const daemonBackupResult = {
  success: true,
  backup: { filePath: daemonLocalPath, uuid: 'backup-uuid-1', size: 1234, checksum: 'sha1abc' },
};

const defaultCloudSettings = {
  airlinkCloudBackupEnabled: true,
  airlinkCloudApiKey: 'cloud-key',
  s3Enabled: false,
};
const defaultLocalSettings = {
  airlinkCloudBackupEnabled: false,
  airlinkCloudApiKey: null,
  s3Enabled: false,
};

function defaultDaemon() {
  mockDaemonRequest.mockImplementation((opts: any) => {
    if (opts.method === 'DELETE') return Promise.resolve({ status: 200, data: {} });
    if (opts.path === '/container/backup/download')
      return Promise.resolve({ status: 200, data: {} });
    return Promise.resolve({ status: 200, data: daemonBackupResult });
  });
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(stubSession({ id: 1, isAdmin: true }));
  const router = Router();
  registerBackupRoutes(router);
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

function createdBackupRow(filePath: string, airlinkCloudId: string | null) {
  return {
    id: 1,
    UUID: 'backup-uuid-1',
    name: 'my-backup',
    serverId: 'srv-abc',
    filePath,
    size: BigInt(1234),
    checksum: 'sha1abc',
    locked: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    airlinkCloudId,
  };
}

async function postCreate(base: string, body?: Record<string, unknown>) {
  return fetch(`${base}/server/srv-abc/backups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? { name: 'my-backup' }),
  });
}

describe('backups backend create state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.server.findUnique.mockResolvedValue(serverFixture as any);
    (mockPrisma.backup.count as any).mockResolvedValue(0);
    (mockPrisma.settings.findUnique as any).mockResolvedValue(defaultLocalSettings as any);
    (mockPrisma.backup.create as any).mockImplementation((args: any) =>
      Promise.resolve(createdBackupRow(args.data.filePath, args.data.airlinkCloudId) as any),
    );
    (mockPrisma.activityLog.create as any).mockResolvedValue({});
    defaultDaemon();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create with remote redirect SUCCESS (cloud): deletes local temp, sets cloud id & filePath=airlink-cloud, persisted, remoteRedirect ok', async () => {
    (mockPrisma.settings.findUnique as any).mockResolvedValue(defaultCloudSettings as any);
    vi.spyOn(AirlinkCloudClient.prototype, 'uploadFile').mockResolvedValue({ id: 'cloud-file-1' } as any);

    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.remoteRedirect).toBe('ok');
      expect(body.message).toBe('Backup created and uploaded to Airlink Cloud');
      expect(body.backup.filePath).toBe('airlink-cloud');
      expect(body.backup.airlinkCloudId).toBe('cloud-file-1');

      const createArgs = (mockPrisma.backup.create as any).mock.calls[0][0];
      expect(createArgs.data.filePath).toBe('airlink-cloud');
      expect(createArgs.data.airlinkCloudId).toBe('cloud-file-1');
      expect(createArgs.data.UUID).toBe('backup-uuid-1');

      // local temp deleted via daemon DELETE backing the daemon-local path
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall).toBeTruthy();
      expect(deleteCall[0].path).toBe('/container/backup');
      expect(deleteCall[0].body).toEqual({ backupPath: daemonLocalPath });
    });
  });

  it('create with remote redirect SUCCESS (s3): sets S3 key & persists, remoteRedirect ok', async () => {
    (mockPrisma.settings.findUnique as any).mockResolvedValue({
      airlinkCloudBackupEnabled: false,
      airlinkCloudApiKey: null,
      s3Enabled: true,
    } as any);
    mockUploadStreamToS3.mockResolvedValue('done');

    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.remoteRedirect).toBe('ok');
      expect(body.backup.filePath).toBe('s3:backups/srv-abc/backup-uuid-1.tar.gz');
      const createArgs = (mockPrisma.backup.create as any).mock.calls[0][0];
      expect(createArgs.data.filePath).toBe('s3:backups/srv-abc/backup-uuid-1.tar.gz');
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall[0].body).toEqual({ backupPath: daemonLocalPath });
    });
  });

  it('create with remote redirect FAILURE (cloud upload throws): temp NOT deleted, persists daemon-local path + null cloud id, remoteRedirect failed with explicit message', async () => {
    (mockPrisma.settings.findUnique as any).mockResolvedValue(defaultCloudSettings as any);
    vi.spyOn(AirlinkCloudClient.prototype, 'uploadFile').mockRejectedValue(new Error('cloud down'));

    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.remoteRedirect).toBe('failed');
      expect(body.message).toContain('remote upload failed');
      expect(body.backup.filePath).toBe(daemonLocalPath);
      expect(body.backup.airlinkCloudId).toBeNull();

      const createArgs = (mockPrisma.backup.create as any).mock.calls[0][0];
      expect(createArgs.data.filePath).toBe(daemonLocalPath);
      expect(createArgs.data.airlinkCloudId).toBeNull();

      // no daemon DELETE should have been issued for the local temp
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });
  });

  it('create with remote redirect FAILURE (cloud returns no id): local kept, persisted with null cloud id, remoteRedirect failed', async () => {
    (mockPrisma.settings.findUnique as any).mockResolvedValue(defaultCloudSettings as any);
    vi.spyOn(AirlinkCloudClient.prototype, 'uploadFile').mockResolvedValue({} as any);

    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      const body = await res.json();
      expect(body.remoteRedirect).toBe('failed');
      expect(body.backup.filePath).toBe(daemonLocalPath);
      expect(body.backup.airlinkCloudId).toBeNull();
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });
  });

  it('create with remote redirect FAILURE (s3 upload throws): local kept, persisted, remoteRedirect failed', async () => {
    (mockPrisma.settings.findUnique as any).mockResolvedValue({
      airlinkCloudBackupEnabled: false,
      airlinkCloudApiKey: null,
      s3Enabled: true,
    } as any);
    mockUploadStreamToS3.mockRejectedValue(new Error('s3 unreachable'));

    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.remoteRedirect).toBe('failed');
      expect(body.backup.filePath).toBe(daemonLocalPath);
      const createArgs = (mockPrisma.backup.create as any).mock.calls[0][0];
      expect(createArgs.data.filePath).toBe(daemonLocalPath);
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });
  });

  it('create with remote disabled: remoteRedirect none, no daemon temp delete', async () => {
    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.remoteRedirect).toBe('none');
      expect(body.message).toBe('Backup created successfully');
      expect(body.backup.filePath).toBe(daemonLocalPath);
      expect(body.backup.airlinkCloudId).toBeNull();
      const deleteCall = mockDaemonRequest.mock.calls.find((c: any) => c[0].method === 'DELETE');
      expect(deleteCall).toBeUndefined();
    });
  });

  it('create without backup name returns 400', async () => {
    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base, {});
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
      expect(mockPrisma.backup.create).not.toHaveBeenCalled();
    });
  });

  it('create with missing user returns 404', async () => {
    mockPrisma.users.findUnique
      .mockResolvedValueOnce(adminUser as any) // middleware
      .mockResolvedValueOnce(null); // handler
    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('User not found');
      expect(mockPrisma.backup.create).not.toHaveBeenCalled();
    });
  });

  it('create with missing server returns 404', async () => {
    mockPrisma.server.findUnique.mockResolvedValue(null as any);
    await withServer(buildApp(), async (base) => {
      const res = await postCreate(base);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Server not found');
      expect(mockPrisma.backup.create).not.toHaveBeenCalled();
    });
  });
});