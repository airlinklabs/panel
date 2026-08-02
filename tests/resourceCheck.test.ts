import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../src/db', () => ({
  default: {
    server: {
      findMany: vi.fn(),
    },
  },
}));

import { assertNodeCapacity } from '../src/handlers/utils/server/resourceCheck';
import prisma from '../src/db';

const mockPrisma = vi.mocked(prisma);

describe('assertNodeCapacity', () => {
  const baseNode = {
    id: 1,
    ram: 8,       // 8 GB
    cpu: 200,     // 200%
    disk: 100,    // 100 GB
    overallocateMemory: 0,
    overallocateDisk: 0,
    overallocateCpu: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.server.findMany.mockResolvedValue([]);
  });

  it('passes when node has capacity', async () => {
    await expect(
      assertNodeCapacity(baseNode, 1024, 100, 20480)
    ).resolves.toBeUndefined();
  });

  it('throws when memory exceeded', async () => {
    // 8 GB = 8192 MB, no overallocation
    await expect(
      assertNodeCapacity(baseNode, 8193, 100, 20480)
    ).rejects.toThrow('memory capacity exceeded');
  });

  it('throws when CPU exceeded', async () => {
    // 200% = 2 cores, no overallocation
    await expect(
      assertNodeCapacity(baseNode, 1024, 201, 20480)
    ).rejects.toThrow('CPU capacity exceeded');
  });

  it('throws when disk exceeded', async () => {
    // 100 GB = 102400 MB, no overallocation
    await expect(
      assertNodeCapacity(baseNode, 1024, 100, 102401)
    ).rejects.toThrow('disk capacity exceeded');
  });

  it('accounts for existing servers', async () => {
    mockPrisma.server.findMany.mockResolvedValue([
      { Memory: 4096, Cpu: 100, Storage: 51200 },
    ] as any);

    // 8 GB total, 4 GB used, adding 4097 should fail
    await expect(
      assertNodeCapacity(baseNode, 4097, 100, 20480)
    ).rejects.toThrow('memory capacity exceeded');
  });

  it('respects overallocation for memory', async () => {
    const node = { ...baseNode, overallocateMemory: 50 };
    // 8 GB * 1.5 = 12 GB = 12288 MB
    await expect(
      assertNodeCapacity(node, 12288, 100, 20480)
    ).resolves.toBeUndefined();

    // 8 GB * 1.5 = 12288 MB, adding 1 more should fail
    await expect(
      assertNodeCapacity(node, 12289, 100, 20480)
    ).rejects.toThrow('memory capacity exceeded');
  });

  it('skips excluded server from calculation', async () => {
    mockPrisma.server.findMany.mockImplementation(({ where }: any) => {
      if (where?.NOT?.UUID === 'exclude-me') {return Promise.resolve([]);}
      return Promise.resolve([{ Memory: 4096, Cpu: 100, Storage: 51200 }]);
    });

    // Excluding the existing server means full capacity available
    await expect(
      assertNodeCapacity(baseNode, 8192, 200, 102400, 'exclude-me')
    ).resolves.toBeUndefined();

    // Verify the exclude filter was passed
    expect(mockPrisma.server.findMany).toHaveBeenCalledWith({
      where: {
        nodeId: 1,
        NOT: { UUID: 'exclude-me' },
      },
    });
  });

  it('allows unlimited when node limit is 0', async () => {
    const unlimitedNode = { ...baseNode, ram: 0, cpu: 0, disk: 0 };
    await expect(
      assertNodeCapacity(unlimitedNode, 999999, 999999, 999999)
    ).resolves.toBeUndefined();
  });
});
