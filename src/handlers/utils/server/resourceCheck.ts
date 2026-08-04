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

  const usedMemoryMb = servers.reduce((sum, s) => sum + s.Memory, 0);
  const usedCpu = servers.reduce((sum, s) => sum + s.Cpu, 0);
  const usedStorageMb = servers.reduce((sum, s) => sum + s.Storage, 0);

  if (node.ram > 0) {
    const capMb = Math.round(node.ram * 1024 * (1 + node.overallocateMemory / 100));
    const totalRequestedMb = usedMemoryMb + newMemory;
    if (totalRequestedMb > capMb) {
      const requestedGb = (totalRequestedMb / 1024).toFixed(1);
      const availableGb = (capMb / 1024).toFixed(1);
      throw new Error(
        `Node memory capacity exceeded: ${requestedGb} GB requested, ${availableGb} GB available (${node.ram} GB base + ${node.overallocateMemory}% overallocation).`,
      );
    }
  }

  if (node.cpu > 0) {
    const cap = node.cpu * (1 + node.overallocateCpu / 100);
    if (usedCpu + newCpu > cap) {
      throw new Error(
        `Node CPU capacity exceeded: ${Math.round(usedCpu + newCpu)}% requested, ${Math.round(cap)}% available (${node.cpu}% base + ${node.overallocateCpu}% overallocation).`,
      );
    }
  }

  if (node.disk > 0) {
    const capMb = Math.round(node.disk * 1024 * (1 + node.overallocateDisk / 100));
    const totalRequestedMb = usedStorageMb + newStorage;
    if (totalRequestedMb > capMb) {
      const requestedGb = (totalRequestedMb / 1024).toFixed(1);
      const availableGb = (capMb / 1024).toFixed(1);
      throw new Error(
        `Node disk capacity exceeded: ${requestedGb} GB requested, ${availableGb} GB available (${node.disk} GB base + ${node.overallocateDisk}% overallocation).`,
      );
    }
  }
}
