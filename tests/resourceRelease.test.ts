import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../src/db', () => ({
  default: {
    server: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    serverMount: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock daemonRequest
vi.mock('../src/handlers/utils/core/daemonRequest', () => ({
  daemonRequest: vi.fn(),
}));

// Mock ports
vi.mock('../src/handlers/utils/server/ports', () => ({
  getPrimaryExternalPort: vi.fn().mockReturnValue(25565),
  portsToDaemonString: vi.fn().mockReturnValue('25565:25565'),
}));

import prisma from '../src/db';
import { daemonRequest } from '../src/handlers/utils/core/daemonRequest';
import {
  startServerContainer,
  stopServerContainer,
  restartServerContainer,
} from '../src/modules/user/server/shared';
import { NodeCapacityExceededError } from '../src/handlers/utils/server/resourceCheck';

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);

const baseNode = {
  id: 1,
  ram: 4,       // 4 GB
  cpu: 100,     // 1 core
  disk: 10,     // 10 GB
  overallocateMemory: 0,
  overallocateDisk: 0,
  overallocateCpu: 0,
  address: '127.0.0.1',
  port: 3001,
  key: 'test-key',
  name: 'node-1',
};

const baseServer = {
  UUID: 'abc-123',
  Memory: 4096,   // 4 GB
  Swap: 0,
  Cpu: 100,
  Storage: 10240, // 10 GB
  Ports: '[{"Port":"25565:25565","primary":true}]',
  StartCommand: 'java -jar server.jar',
  Variables: '[]',
  dockerImage: '{"default":"itzg/minecraft-server"}',
  node: baseNode,
  image: { config_files: null, stop: 'stop' } as any,
};

function runningServer(serverId: string, memory: number): any {
  return { UUID: serverId, Memory: memory, Cpu: 100, Storage: 10240, Running: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemonRequest.mockResolvedValue({ status: 200, data: {} });
  mockPrisma.server.findMany.mockResolvedValue([]);
  mockPrisma.server.update.mockResolvedValue({} as any);
});

describe('resource release after container stop', () => {
  it('start succeeds when the node is only consumed by stopped servers', async () => {
    // A stopped 4 GB server has freed its resources — starting another 4 GB
    // server on a 4 GB node must be allowed.
    mockPrisma.server.findMany.mockImplementation(({ where }: any) => {
      if (where?.Running === true) return Promise.resolve([]);
      return Promise.resolve([runningServer('stopped-1', 4096)]);
    });

    await expect(startServerContainer(baseServer as any, 'abc-123')).resolves.toBeUndefined();
    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
  });

  it('start is blocked when running servers already consume the node', async () => {
    // A running 4 GB server holds the node — starting another 4 GB server
    // must fail with NodeCapacityExceededError and never reach the daemon.
    mockPrisma.server.findMany.mockImplementation(({ where }: any) => {
      if (where?.Running === true) return Promise.resolve([runningServer('running-1', 4096)]);
      return Promise.resolve([runningServer('running-1', 4096)]);
    });

    await expect(startServerContainer(baseServer as any, 'abc-123')).rejects.toBeInstanceOf(
      NodeCapacityExceededError,
    );
    expect(mockDaemonRequest).not.toHaveBeenCalled();
  });

  it('marks the server running after a successful start', async () => {
    await startServerContainer(baseServer as any, 'abc-123');

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    expect(mockPrisma.server.update).toHaveBeenCalledWith(
      { where: { UUID: 'abc-123' }, data: { Running: true } },
    );
  });

  it('frees the reservation when a server is stopped', async () => {
    await stopServerContainer(baseServer as any, 'abc-123', 'stop');

    expect(mockDaemonRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/container/stop', body: { id: 'abc-123', stopCmd: 'stop' } }),
    );
    expect(mockPrisma.server.update).toHaveBeenCalledWith(
      { where: { UUID: 'abc-123' }, data: { Running: false } },
    );
  });

  it('does not free the reservation during a restart', async () => {
    // restartServerContainer must stop without releasing Running, then start
    // (which sets Running back to true) — it must never write Running:false.
    mockPrisma.server.findMany.mockResolvedValue([]);

    await restartServerContainer(baseServer as any, 'abc-123');

    const stopUpdate = mockPrisma.server.update.mock.calls.find(([args]) => {
      const data = (args as any).data;
      return data && data.Running === false;
    });
    expect(stopUpdate).toBeUndefined();
    expect(mockPrisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { Running: true } }),
    );
  });

  it('passes a running-only capacity check that excludes the starting server', async () => {
    // During a restart the server is still Running, so its own resources are
    // reserved (excluded from the other-server sum) rather than freed.
    mockPrisma.server.findMany.mockImplementation(({ where }: any) => {
      if (where?.NOT?.UUID === 'abc-123' && where?.Running === true) {
        return Promise.resolve([runningServer('neighbor', 2048)]);
      }
      return Promise.resolve([runningServer('abc-123', 4096)]);
    });

    // 4 GB node: neighbor (2 GB) + self (4 GB) exceeds it, so the restart
    // would be blocked even though it is the same server — reservation held.
    await expect(restartServerContainer(baseServer as any, 'abc-123')).rejects.toBeInstanceOf(
      NodeCapacityExceededError,
    );
  });
});
