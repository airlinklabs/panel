import prisma from '../../../db';

export class NodeCapacityExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeCapacityExceededError';
  }
}

export interface NodeCapacityOptions {
  // Count only running servers against node capacity. Stopped servers have
  // freed their resources, so they no longer consume capacity. Defaults to
  // false so provisioning checks (create/edit/transfer) keep counting the
  // total footprint on the node.
  runningOnly?: boolean;
}

// Enforce node capacity with overallocation. Any node limit of 0 = unlimited.
// Node ram/disk are stored in GB; server Memory/Storage are in MB. CPU is a
// percentage on both (100 = 1 core).
export async function assertNodeCapacity(
  node: { id: number; ram: number; cpu: number; disk: number; overallocateMemory: number; overallocateDisk: number; overallocateCpu: number },
  newMemory: number,
  newCpu: number,
  newStorage: number,
  excludeServerId?: string,
  options: NodeCapacityOptions = {},
): Promise<void> {
  const servers = await prisma.server.findMany({
    where: {
      nodeId: node.id,
      ...(options.runningOnly ? { Running: true } : {}),
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
      throw new NodeCapacityExceededError(
        `Node memory capacity exceeded: ${requestedGb} GB requested, ${availableGb} GB available (${node.ram} GB base + ${node.overallocateMemory}% overallocation).`,
      );
    }
  }

  if (node.cpu > 0) {
    const cap = node.cpu * (1 + node.overallocateCpu / 100);
    if (usedCpu + newCpu > cap) {
      throw new NodeCapacityExceededError(
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
      throw new NodeCapacityExceededError(
        `Node disk capacity exceeded: ${requestedGb} GB requested, ${availableGb} GB available (${node.disk} GB base + ${node.overallocateDisk}% overallocation).`,
      );
    }
  }
}
