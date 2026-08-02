import prisma from '../../../db';

// Enforce node capacity with overallocation. Any node limit of 0 = unlimited.
// Node ram/disk are stored in GB; server Memory/Storage are in MB. CPU is a
// percentage on both (100 = 1 core).
export async function assertNodeCapacity(
  node: { id: number; ram: number; cpu: number; disk: number; overallocateMemory: number; overallocateDisk: number; overallocateCpu: number },
  newMemory: number,
  newCpu: number,
  newStorage: number,
  excludeServerId?: string,
): Promise<void> {
  const servers = await prisma.server.findMany({
    where: {
      nodeId: node.id,
      ...(excludeServerId ? { NOT: { UUID: excludeServerId } } : {}),
    },
  });

  const usedMemory = servers.reduce((sum, s) => sum + s.Memory, 0);
  const usedCpu = servers.reduce((sum, s) => sum + s.Cpu, 0);
  const usedDisk = servers.reduce((sum, s) => sum + s.Storage, 0);

  if (node.ram > 0) {
    const capMb = node.ram * 1024 * (1 + node.overallocateMemory / 100);
    if (usedMemory + newMemory > capMb) {
      throw new Error(
        `Node memory capacity exceeded: ${Math.round((usedMemory + newMemory) / 1024)} GB requested, ${Math.round(capMb / 1024)} GB available (${node.ram} GB with ${node.overallocateMemory}% overallocation).`,
      );
    }
  }

  if (node.cpu > 0) {
    const cap = node.cpu * (1 + node.overallocateCpu / 100);
    if (usedCpu + newCpu > cap) {
      throw new Error(
        `Node CPU capacity exceeded: ${Math.round(usedCpu + newCpu)}% requested, ${Math.round(cap)}% available (${node.cpu}% with ${node.overallocateCpu}% overallocation).`,
      );
    }
  }

  if (node.disk > 0) {
    const capMb = node.disk * 1024 * (1 + node.overallocateDisk / 100);
    if (usedDisk + newStorage > capMb) {
      throw new Error(
        `Node disk capacity exceeded: ${Math.round((usedDisk + newStorage) / 1024)} GB requested, ${Math.round(capMb / 1024)} GB available (${node.disk} GB with ${node.overallocateDisk}% overallocation).`,
      );
    }
  }
}
