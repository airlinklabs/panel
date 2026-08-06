import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import express from 'express';

// ── Mocks (must be hoisted above the module imports below) ──────────────

vi.mock('../src/db', () => ({
  default: {
    users: { findUnique: vi.fn() },
    node: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
    server: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    settings: { findUnique: vi.fn() },
    location: { findUnique: vi.fn(), findMany: vi.fn() },
    images: { findUnique: vi.fn() },
    sftpCredential: { deleteMany: vi.fn() },
    backup: { deleteMany: vi.fn() },
    serverFolderMember: { deleteMany: vi.fn() },
    activityLog: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/handlers/utils/core/daemonRequest', () => ({
  daemonRequest: vi.fn(),
}));

vi.mock('../src/handlers/utils/activity/activityLogger', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../src/handlers/utils/server/allocations', () => ({
  syncNodeAllocations: vi.fn().mockResolvedValue(undefined),
  getNodePortPool: vi.fn().mockResolvedValue([30000, 30001]),
  claimNodePorts: vi.fn().mockResolvedValue(1),
  releaseServerAllocations: vi.fn().mockResolvedValue(undefined),
  withNodePortLock: vi.fn().mockImplementation((_nodeId: number, task: () => Promise<unknown>) => task()),
}));

vi.mock('../src/handlers/utils/server/ports', () => ({
  normalizeServerPorts: vi.fn().mockImplementation((ports: unknown) => {
    const input: any[] = Array.isArray(ports) ? ports : [];
    return input.map((p, index) => ({
      name: String(p?.name ?? `Port ${index + 1}`),
      internalPort: Number(p?.internalPort),
      externalPort: Number(p?.externalPort),
      primary: Boolean(p?.primary || index === 0),
    }));
  }),
  parseImagePortRequirements: vi.fn().mockReturnValue([]),
  parseServerPorts: vi.fn().mockReturnValue([
    { name: 'Game', internalPort: 25565, externalPort: 30001, primary: true },
  ]),
  serializeServerPorts: vi.fn().mockReturnValue('[{"name":"Game","internalPort":25565,"externalPort":30001,"Port":"30001:25565","primary":true}]'),
  validatePortAssignments: vi.fn().mockReturnValue(null),
  getUsedExternalPorts: vi.fn().mockReturnValue([]),
  getPrimaryExternalPort: vi.fn().mockReturnValue(30001),
}));

vi.mock('../src/handlers/utils/server/resourceCheck', () => ({
  assertNodeCapacity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/apiKey', () => ({
  generateApiKey: vi.fn().mockReturnValue('z'.repeat(32)),
}));

vi.mock('../src/handlers/utils/core/mailer', () => ({
  sendServerSuspended: vi.fn(),
}));

// ── Module under test ───────────────────────────────────────────────────

import prisma from '../src/db';
import { daemonRequest } from '../src/handlers/utils/core/daemonRequest';
import nodesModule from '../src/modules/admin/nodes';
import serversModule from '../src/modules/admin/servers';
import { releaseServerAllocations } from '../src/handlers/utils/server/allocations';
import {
  parseServerPorts,
  serializeServerPorts,
} from '../src/handlers/utils/server/ports';

const mockPrisma = vi.mocked(prisma);
const mockDaemon = vi.mocked(daemonRequest);

const adminUser = { id: 1, isAdmin: true, totpEnabled: true, permissions: '[]', email: 'a@b.c' };

function stubSession() {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).session = { user: { id: 1 } };
    next();
  };
}

function buildApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(stubSession());
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

async function request(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}

// ── Helpers for auth ────────────────────────────────────────────────────

// The two admin modules both call users.findUnique for the session user on
// every request (via isAuthenticated). Default it to an authenticated admin.
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
  mockPrisma.settings.findUnique.mockResolvedValue(null as any);
  mockPrisma.server.findMany.mockResolvedValue([] as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
//  NODES
// ─────────────────────────────────────────────────────────────────────────

describe('admin nodes: delete safety', () => {
  it('blocks deleting a node that still has servers assigned (400, node untouched)', async () => {
    const router = nodesModule.router();
    mockPrisma.node.findUnique.mockResolvedValue({ id: 5 } as any);
    mockPrisma.server.count.mockResolvedValue(2);

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'DELETE', '/admin/node/5');
      expect(r.status).toBe(400);
      expect(r.text).toContain('2 server(s)');
    });

    expect(mockPrisma.node.delete).not.toHaveBeenCalled();
    expect(mockPrisma.server.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes an empty node successfully', async () => {
    const router = nodesModule.router();
    mockPrisma.node.findUnique.mockResolvedValue({ id: 5 } as any);
    mockPrisma.server.count.mockResolvedValue(0);
    mockPrisma.node.delete.mockResolvedValue({ id: 5 } as any);

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'DELETE', '/admin/node/5');
      expect(r.status).toBe(200);
      expect(r.text).toContain('Node deleted successfully');
    });

    expect(mockPrisma.node.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('returns 404 when the node does not exist', async () => {
    const router = nodesModule.router();
    mockPrisma.node.findUnique.mockResolvedValue(null as any);

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'DELETE', '/admin/node/5');
      expect(r.status).toBe(404);
    });
  });

  it('returns 400 on a non-numeric node id', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'DELETE', '/admin/node/not-a-number');
      expect(r.status).toBe(400);
    });
  });
});

describe('admin nodes: create validation', () => {
  const validNodeBody = {
    name: 'Test Node',
    ram: '2048',
    cpu: '100',
    disk: '20480',
    address: '127.0.0.1',
    port: '3001',
    allocatedPorts: '[]',
  };

  it('rejects a port below the allowed range', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, port: '80' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('rejects a port above the allowed range', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, port: '99999' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('rejects a missing/empty address', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, address: '' });
      expect(r.status).toBe(400);
      expect(r.text).toContain('Address');
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid address value', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, address: 'not a host!!' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('rejects a too-short name', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, name: 'ab' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('rejects a fractional resource limit', async () => {
    const router = nodesModule.router();
    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', { ...validNodeBody, ram: '2048.5' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.node.create).not.toHaveBeenCalled();
  });

  it('creates a valid node', async () => {
    const router = nodesModule.router();
    mockPrisma.node.create.mockResolvedValue({ id: 9, name: 'Test Node' } as any);

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/nodes/create', validNodeBody);
      expect(r.status).toBe(200);
      expect(r.text).toContain('Node created successfully');
    });

    expect(mockPrisma.node.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.node.create.mock.calls[0][0].data.address).toBe('127.0.0.1');
    expect(mockPrisma.node.create.mock.calls[0][0].data.port).toBe(3001);
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  SERVERS
// ─────────────────────────────────────────────────────────────────────────

const validServerBody = {
  name: 'My Server',
  description: 'desc',
  nodeId: '1',
  imageId: '1',
  Ports: '30001:25565',
  Memory: '2048',
  Cpu: '100',
  Storage: '20480',
  ownerId: '1',
  dockerImage: 'alpine',
};

describe('admin servers: create preconditions', () => {
  it('rejects creation when the owner does not exist', async () => {
    const router = serversModule.router();
    // session user (id 1) is the admin; the submitted ownerId (999) is unknown
    mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
      where?.id === 1 ? adminUser : null,
    );

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', { ...validServerBody, ownerId: '999' });
      expect(r.status).toBe(400);
      expect(r.text).toContain('Owner not found');
    });
    expect(mockPrisma.server.create).not.toHaveBeenCalled();
  });

  it('rejects creation when the node does not exist', async () => {
    const router = serversModule.router();
    mockPrisma.node.findUnique.mockResolvedValue(null as any);

    await withServer(buildApp(router), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', validServerBody);
      expect(r.status).toBe(400);
      expect(r.text).toContain('Selected node not found');
    });
    expect(mockPrisma.server.create).not.toHaveBeenCalled();
  });
});

describe('admin servers: resource bounds', () => {
  it('rejects negative memory', async () => {
    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', { ...validServerBody, Memory: '-500' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.server.create).not.toHaveBeenCalled();
  });

  it('rejects non-numeric CPU', async () => {
    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', { ...validServerBody, Cpu: 'abc' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.server.create).not.toHaveBeenCalled();
  });

  it('rejects zero storage', async () => {
    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', { ...validServerBody, Storage: '0' });
      expect(r.status).toBe(400);
    });
    expect(mockPrisma.server.create).not.toHaveBeenCalled();
  });
});

describe('admin server create: port handling uses canonical helpers', () => {
  const imageFixture = {
    id: 1,
    portRequirements: '[]',
    dockerImages: JSON.stringify([{ alpine: 'pine/image:latest' }]),
    startup: './start.sh',
    variables: JSON.stringify([{ env_variable: 'SRV_PORT', default_value: '25565' }]),
  };

  it('round-trips the submitted port through parseServerPorts + serializeServerPorts', async () => {
    mockPrisma.node.findUnique.mockResolvedValue({ id: 1, maintenanceMode: false } as any);
    mockPrisma.images.findUnique.mockResolvedValue(imageFixture as any);
    mockPrisma.server.create.mockResolvedValue({
      id: 2,
      UUID: 'srv-new',
      nodeId: 1,
      Queued: true,
      Variables: JSON.stringify([]),
    } as any);
    mockPrisma.$executeRaw.mockResolvedValue([]);

    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/servers/create', validServerBody);
      expect(r.status).toBe(200);
      expect(r.text).toContain('Server created successfully');
    });

    // The submitted single-port string is parsed by the canonical helper rather
    // than a bespoke split(':')/JSON.parse inline.
    expect(parseServerPorts).toHaveBeenCalled();
    expect(serializeServerPorts).toHaveBeenCalled();
    expect(mockPrisma.server.create).toHaveBeenCalledTimes(1);
  });
});

describe('admin server delete: cleanup and errors', () => {
  const serverRow = {
    id: 1,
    UUID: 'srv-del',
    name: 'My Server',
    nodeId: 1,
    node: { address: '127.0.0.1', port: 3001, key: 'k' },
    image: { stop: 'stop' },
    owner: { email: 'o@example.com' },
  };

  const activeTx = () => ({
    sftpCredential: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    backup: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    serverFolderMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    activityLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    server: { delete: vi.fn().mockResolvedValue({}) },
  });

  it('cleans up dependent rows inside the transaction', async () => {
    mockPrisma.server.findUnique.mockResolvedValue(serverRow as any);
    mockDaemon.mockResolvedValue({ status: 200, data: {} } as any);

    let tx: ReturnType<typeof activeTx> | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (t: any) => Promise<void>) => {
      tx = activeTx();
      await cb(tx);
      return tx;
    });

    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/server/delete/1');
      // redirect back to the servers list after success
      expect(r.status).toBe(302);
      expect(r.location).toBe('/admin/servers');
    });

    expect(tx).toBeDefined();
    expect(tx!.backup.deleteMany).toHaveBeenCalledWith({ where: { serverId: 'srv-del' } });
    expect(tx!.serverFolderMember.deleteMany).toHaveBeenCalledWith({ where: { serverUUID: 'srv-del' } });
    expect(tx!.server.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(releaseServerAllocations).toHaveBeenCalledWith('srv-del');
  });

  it('errors cleanly (no partial delete) when the daemon is unreachable and force is unset', async () => {
    mockPrisma.server.findUnique.mockResolvedValue(serverRow as any);
    mockDaemon.mockResolvedValue({ status: 500, data: { error: 'container exploded' } } as any);
    mockPrisma.$transaction.mockClear();

    await withServer(buildApp(serversModule.router()), async (base) => {
      const r = await request(base, 'POST', '/admin/server/delete/1');
      expect(r.status).toBe(500);
      expect(r.text).toContain('force=true');
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.server.delete).not.toHaveBeenCalled();
  });
});