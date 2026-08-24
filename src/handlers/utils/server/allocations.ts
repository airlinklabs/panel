import prisma from '../../../db';

// ── Shared per-node mutex ─────────────────────────────────────────────────────
// Serializes the "read pool → pick port → persist server → claim" sequence so
// concurrent create/update requests for the same node can't assign the same port.
const portMutexes = new Map<number, Promise<void>>();

export async function withNodePortLock<T>(nodeId: number, task: () => Promise<T>): Promise<T> {
  const prev = portMutexes.get(nodeId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = prev.catch(() => {}).then(() => current);
  portMutexes.set(nodeId, tail);
  await prev.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (portMutexes.get(nodeId) === tail) {portMutexes.delete(nodeId);}
  }
}

// Ports stored before the Allocation table existed (Node.allocatedPorts JSON).
export function parseLegacyPool(raw: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {return [];}
    return parsed.filter((p): p is number => typeof p === 'number');
  } catch {
    return [];
  }
}

// Union of every port that is part of this node's pool (legacy JSON + DB rows).
export async function getNodePortPool(nodeId: number): Promise<number[]> {
  const node = await prisma.node.findUnique({ where: { id: nodeId }, select: { allocatedPorts: true } });
  const legacy = parseLegacyPool(node?.allocatedPorts);
  const rows = await prisma.allocation.findMany({
    where: { nodeId },
    select: { port: true },
  });
  return Array.from(new Set([...legacy, ...rows.map((r) => r.port)])).sort((a, b) => a - b);
}

// Reconcile DB rows to match the admin-configured port pool. Existing claims
// (serverId set) are never deleted; extra unclaimed rows for ports no longer in
// the pool are removed. Backfills rows for pooled ports that lack a row.
export async function syncNodeAllocations(
  nodeId: number,
  ports: number[],
  ip = '',
): Promise<void> {
  const rows = await prisma.allocation.findMany({ where: { nodeId }, select: { id: true, port: true, ip: true, serverId: true } });
  const claimed = new Set(rows.filter((r) => r.serverId).map((r) => r.port));
  const existing = new Map(rows.map((r) => [r.port, r]));

  for (const port of ports) {
    if (!existing.has(port)) {
      await prisma.allocation.create({ data: { nodeId, ip, port } });
    } else if (existing.get(port)!.ip !== ip && !claimed.has(port)) {
      await prisma.allocation.update({ where: { id: existing.get(port)!.id }, data: { ip } });
    }
  }

  const keep = new Set(ports);
  for (const row of rows) {
    if (!keep.has(row.port) && !row.serverId) {
      await prisma.allocation.delete({ where: { id: row.id } }).catch(() => {});
    }
  }
}

// Atomically claim ports for a server on a node: only rows that are still free
// at execution time are claimed, so two concurrent writers can't overlap.
export async function claimNodePorts(nodeId: number, ports: number[], serverId: string): Promise<number> {
  const exists = await prisma.server.findUnique({ where: { UUID: serverId }, select: { id: true } });
  if (!exists) {return 0;}

  let claimed = 0;
  for (const port of ports) {
    const r = await prisma.allocation.updateMany({
      where: { nodeId, port, serverId: null },
      data: { serverId },
    });
    claimed += r.count;
  }
  return claimed;
}

// Release a server's allocations so its ports can be reused.
export async function releaseServerAllocations(serverId: string): Promise<void> {
  await prisma.allocation.updateMany({
    where: { serverId },
    data: { serverId: null },
  });
}

export async function releaseNodePorts(nodeId: number, ports: number[]): Promise<void> {
  if (ports.length === 0) {return;}
  await prisma.allocation.updateMany({
    where: { nodeId, port: { in: ports }, serverId: { not: null } },
    data: { serverId: null },
  });
}