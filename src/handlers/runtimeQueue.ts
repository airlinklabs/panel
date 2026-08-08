import prisma from '../db';
import logger from './logger';
import { assertNodeCapacity } from './utils/server/resourceCheck';
import { startServerContainer } from '../modules/user/server/shared';
import { emitRealtime, serverEvent } from './realtime/events';

// ── Runtime start queue ───────────────────────────────────────────────────────
// A capacity-aware admission queue for *runtime container starts*. Installs and
// reinstalls are serialized by the install queue; this queue serializes power-on
// requests that cannot be satisfied immediately because the node is full.
//
// Behaviour:
//  - Starts are granted serially per node (a per-node mutex + processor), so
//    concurrent requests cannot over-subscribe a node.
//  - Capacity is derived from servers currently marked Running (stopped servers
//    have freed their resources). A queued request is granted as soon as a stop,
//    delete, or transfer frees enough resources — see cleanCapacityFreed().
//  - Admins and the owner skip the queue: their request is placed at the front
//    of the queue (behind other priority requests) so it is granted first when
//    capacity frees; if capacity is free they start immediately.
//  - Owners and admins can cancel/kick queued starts and admins can temporarily
//    ban a user from queueing at all.
//
// Durability: the queue is in-memory and per process (like queueer). If the
// panel restarts, pending starts are lost; a server that was merely queued
// simply stays stopped and can be started again. All queue mutations are
// serialized through a single promise-chain mutex, and grants run one at a time
// per node, so the queue is hard to corrupt under concurrency.

interface QueueEntry {
  serverId: string;
  userId: number;
  priority: boolean;
  addedAt: number;
  failures: number;
}

export class QueueBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueBlockedError';
  }
}

export class QueueBannedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueBannedError';
  }
}

const MAX_GLOBAL_QUEUE = 400;
const MAX_PER_USER = 8;
const DEFAULT_BAN_MINUTES = 30;
const MAX_GRANT_FAILURES = 3;
const RETRY_DELAY_MS = 5000;

// nodeId -> ordered queue (priority entries first, then FIFO).
const queues = new Map<number, QueueEntry[]>();
// serverId -> nodeId, maintained while an entry is queued.
const serverNode = new Map<string, number>();
// userId -> bannedUntil (epoch ms).
const bannedUsers = new Map<number, number>();
// nodeIds with an active delayed retry timer.
const pendingRetries = new Set<number>();
const processing = new Set<number>();

// ── Mutex ─────────────────────────────────────────────────────────────────────
let mutexTail: Promise<void> = Promise.resolve();

function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const prev = mutexTail;
  mutexTail = prev.catch(() => undefined).then(() => next);
  return prev.catch(() => undefined).then(() => task()).finally(release);
}

function pruneBans(): void {
  const now = Date.now();
  for (const [userId, until] of bannedUsers) {
    if (until <= now) {
      bannedUsers.delete(userId);
    }
  }
}

function nodeQueue(nodeId: number): QueueEntry[] {
  let list = queues.get(nodeId);
  if (!list) {
    list = [];
    queues.set(nodeId, list);
  }
  return list;
}

function insertEntry(list: QueueEntry[], entry: QueueEntry): number {
  if (entry.priority) {
    const priorityCount = list.filter((e) => e.priority).length;
    list.splice(priorityCount, 0, entry);
    return priorityCount;
  }
  list.push(entry);
  return list.length - 1;
}

function removeEntry(list: QueueEntry[], serverId: string): void {
  const index = list.findIndex((e) => e.serverId === serverId);
  if (index !== -1) {
    list.splice(index, 1);
  }
  serverNode.delete(serverId);
}

async function getNodeAvailable(node: {
  id: number;
  ram: number;
  cpu: number;
  disk: number;
  overallocateMemory: number;
  overallocateDisk: number;
  overallocateCpu: number;
}): Promise<{ memoryMb?: number; cpuPercent?: number; diskMb?: number }> {
  const running = await prisma.server.findMany({
    where: { nodeId: node.id, Running: true },
    select: { Memory: true, Cpu: true, Storage: true },
  });
  const usedMemoryMb = running.reduce((sum, s) => sum + s.Memory, 0);
  const usedCpu = running.reduce((sum, s) => sum + s.Cpu, 0);
  const usedDiskMb = running.reduce((sum, s) => sum + s.Storage, 0);

  const available: { memoryMb?: number; cpuPercent?: number; diskMb?: number } = {};
  if (node.ram > 0) {
    const capMb = Math.round(node.ram * 1024 * (1 + node.overallocateMemory / 100));
    available.memoryMb = Math.max(0, capMb - usedMemoryMb);
  }
  if (node.cpu > 0) {
    const cap = node.cpu * (1 + node.overallocateCpu / 100);
    available.cpuPercent = Math.max(0, Math.round(cap - usedCpu));
  }
  if (node.disk > 0) {
    const capMb = Math.round(node.disk * 1024 * (1 + node.overallocateDisk / 100));
    available.diskMb = Math.max(0, capMb - usedDiskMb);
  }
  return available;
}

// Can this server be granted a start right now? Returns false when the entry
// no longer exists (drop it), throws QueueBlockedError when the node lacks
// capacity, and true otherwise. This re-queries the server so capacity and
// suspend state are always evaluated fresh at grant time.
async function capacityAllows(serverId: string, nodeId: number): Promise<boolean> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true },
  });
  if (!server || server.nodeId !== nodeId) {
    return false;
  }
  if (server.Suspended) {
    throw new QueueBlockedError('The server is suspended.');
  }
  try {
    await assertNodeCapacity(
      server.node,
      server.Memory,
      server.Cpu,
      server.Storage,
      serverId,
      { runningOnly: true },
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'NodeCapacityExceededError') {
      throw new QueueBlockedError('Node is at capacity.');
    }
    throw error;
  }
}

async function attemptStart(serverId: string): Promise<'started' | 'gone' | 'failed'> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true, image: true },
  });
  if (!server) {
    return 'gone';
  }
  if (server.Suspended) {
    return 'failed';
  }

  try {
    await startServerContainer(server, serverId);
    return 'started';
  } catch (error) {
    logger.error(`Queued start failed for server ${serverId}:`, error);
    return 'failed';
  }
}

async function processNode(nodeId: number): Promise<void> {
  if (processing.has(nodeId)) {
    return;
  }
  pendingRetries.delete(nodeId);
  processing.add(nodeId);
  try {
    while (true) {
      const list = nodeQueue(nodeId);
      const head = list[0];
      if (!head) {
        break;
      }
      let allowed = false;
      try {
        allowed = await capacityAllows(head.serverId, nodeId);
      } catch (error) {
        if (error instanceof QueueBlockedError) {
          // No capacity (or suspended) right now — wait for a capacity-freed
          // event or the delayed retry timer.
          scheduleRetry(nodeId);
          return;
        }
        throw error;
      }

      if (!allowed) {
        removeEntry(list, head.serverId);
        continue;
      }

      const outcome = await attemptStart(head.serverId);
      if (outcome === 'started' || outcome === 'gone') {
        removeEntry(list, head.serverId);
        broadcastNodeQueue(nodeId);
        continue;
      }

      // Start failed (e.g. daemon hiccup). Keep the entry at the head and retry
      // later; drop it after a few consecutive failures so a permanently broken
      // server cannot stall the whole queue.
      head.failures += 1;
      if (head.failures >= MAX_GRANT_FAILURES) {
        removeEntry(list, head.serverId);
        emitRealtime(
          serverEvent('server.start.failed', head.serverId, {
            error: { message: 'The server could not be started after several attempts.', code: 'QUEUE_GRANT_FAILED' },
          }),
        );
        broadcastNodeQueue(nodeId);
        logger.warn(`Dropped queued start for ${head.serverId} after ${head.failures} failures.`);
      } else {
        scheduleRetry(nodeId);
      }
      return;
    }
  } finally {
    processing.delete(nodeId);
  }
}

function scheduleRetry(nodeId: number): void {
  if (pendingRetries.has(nodeId)) {
    return;
  }
  pendingRetries.add(nodeId);
  setTimeout(() => {
    pendingRetries.delete(nodeId);
    processNode(nodeId).catch((err) => logger.error('Queued start retry failed:', err));
  }, RETRY_DELAY_MS);
}

export interface EnqueueResult {
  queued: boolean;
  position: number;
  total: number;
}

// Realtime: publish the current position/length of every queued server on a
// node so watches on each affected server update live without polling.
function broadcastNodeQueue(nodeId: number): void {
  const list = nodeQueue(nodeId);
  list.forEach((entry, index) => {
    emitRealtime(
      serverEvent('server.start.queue.changed', entry.serverId, {
        state: { queued: true, position: index + 1, total: list.length },
      }),
    );
  });
}

export async function enqueueStart(params: {
  serverId: string;
  userId: number;
  priority: boolean;
}): Promise<EnqueueResult> {
  const { serverId, userId, priority } = params;
  return withQueueLock(async () => {
    pruneBans();
    const bannedUntil = bannedUsers.get(userId);
    if (bannedUntil && bannedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((bannedUntil - Date.now()) / 60000));
      throw new QueueBannedError(`You are temporarily banned from the start queue (${minutes} min remaining).`);
    }

    const server = await prisma.server.findUnique({
      where: { UUID: serverId },
      select: { nodeId: true, Running: true, Suspended: true },
    });
    if (!server) {
      throw new Error('Server not found.');
    }
    if (server.Suspended) {
      throw new Error('This server is suspended.');
    }
    if (server.Running) {
      return { queued: false, position: 0, total: 0 };
    }

    const existing = serverNode.get(serverId);
    if (existing !== undefined) {
      const list = nodeQueue(existing);
      const position = list.findIndex((e) => e.serverId === serverId) + 1;
      return { queued: true, position: Math.max(position, 1), total: list.length };
    }

    const globalCount = queues.size === 0 ? 0 : Array.from(queues.values()).reduce((sum, q) => sum + q.length, 0);
    if (globalCount >= MAX_GLOBAL_QUEUE) {
      throw new Error('The start queue is full. Please try again in a moment.');
    }
    const userCount = Array.from(queues.values()).reduce(
      (sum, q) => sum + q.filter((e) => e.userId === userId).length,
      0,
    );
    if (userCount >= MAX_PER_USER) {
      throw new Error('You already have too many servers waiting to start.');
    }

    const list = nodeQueue(server.nodeId);
    const entry: QueueEntry = { serverId, userId, priority, addedAt: Date.now(), failures: 0 };
    const index = insertEntry(list, entry);
    serverNode.set(serverId, server.nodeId);

    emitRealtime(
      serverEvent('server.start.queued', serverId, {
        state: { queued: true, position: index + 1, total: list.length },
      }),
    );

    processNode(server.nodeId).catch((err) => logger.error('Queued start processor failed:', err));
    return { queued: true, position: index + 1, total: list.length };
  });
}

// Removes a queued start (owner cancel or admin kick). No-op when not queued.
export async function cancelQueuedStart(serverId: string): Promise<boolean> {
  return withQueueLock(async () => {
    const nodeId = serverNode.get(serverId);
    if (nodeId === undefined) {
      return false;
    }
    removeEntry(nodeQueue(nodeId), serverId);
    emitRealtime(serverEvent('server.start.cancelled', serverId));
    broadcastNodeQueue(nodeId);
    processNode(nodeId).catch((err) => logger.error('Queued start processor failed:', err));
    return true;
  });
}

// Admin: drop every queued start owned by a user and block them from queueing.
export async function banUserFromQueue(userId: number, minutes = DEFAULT_BAN_MINUTES): Promise<number> {
  const duration = Math.max(1, minutes) * 60000;
  return withQueueLock(async () => {
    pruneBans();
    bannedUsers.set(userId, Date.now() + duration);
    let removed = 0;
    const affected = new Set<number>();
    for (const [nodeId, list] of queues) {
      const before = list.length;
      const kept = list.filter((e) => e.userId !== userId);
      for (const e of list) {
        if (e.userId === userId) {
          serverNode.delete(e.serverId);
        }
      }
      if (kept.length !== before) {
        queues.set(nodeId, kept);
        removed += before - kept.length;
        affected.add(nodeId);
      }
    }
    for (const nodeId of affected) {
      broadcastNodeQueue(nodeId);
      processNode(nodeId).catch((err) => logger.error('Queued start processor failed:', err));
    }
    return removed;
  });
}

export async function unbanUserFromQueue(userId: number): Promise<boolean> {
  return withQueueLock(async () => {
    pruneBans();
    return bannedUsers.delete(userId);
  });
}

export function isUserBannedFromQueue(userId: number): boolean {
  pruneBans();
  const until = bannedUsers.get(userId);
  return until !== undefined && until > Date.now();
}

// Signal that resources may have been freed (a container stopped or was
// deleted). Re-queues the processor on every node with a non-empty queue.
export async function cleanCapacityFreed(): Promise<void> {
  for (const nodeId of queues.keys()) {
    if (nodeQueue(nodeId).length > 0) {
      processNode(nodeId).catch((err) => logger.error('Queued start processor failed:', err));
    }
  }
}

export function isQueued(serverId: string): boolean {
  return serverNode.has(serverId);
}

export interface QueuePublicState {
  queued: boolean;
  position: number | null;
  total: number;
  available: { memoryMb?: number; cpuPercent?: number; diskMb?: number } | null;
}

export async function getPublicQueueState(
  serverId: string,
  node?: {
    id: number;
    ram: number;
    cpu: number;
    disk: number;
    overallocateMemory: number;
    overallocateDisk: number;
    overallocateCpu: number;
  } | null,
): Promise<QueuePublicState> {
  const nodeId = serverNode.get(serverId);
  if (nodeId === undefined) {
    return { queued: false, position: null, total: 0, available: null };
  }
  const list = nodeQueue(nodeId);
  const position = list.findIndex((e) => e.serverId === serverId) + 1;
  const available = node ? await getNodeAvailable(node).catch(() => null) : null;
  return { queued: true, position: Math.max(position, 1), total: list.length, available };
}

export interface QueueAdminView {
  serverId: string;
  nodeId: number;
  userId: number;
  priority: boolean;
  position: number;
  total: number;
}

export function listQueueForAdmin(): QueueAdminView[] {
  const out: QueueAdminView[] = [];
  for (const [nodeId, list] of queues) {
    list.forEach((e, index) => {
      out.push({
        serverId: e.serverId,
        nodeId,
        userId: e.userId,
        priority: e.priority,
        position: index + 1,
        total: list.length,
      });
    });
  }
  return out;
}

export const runtimeStartQueue = {
  enqueueStart,
  cancelQueuedStart,
  banUserFromQueue,
  unbanUserFromQueue,
  isUserBannedFromQueue,
  cleanCapacityFreed,
  isQueued,
  getPublicQueueState,
  listQueueForAdmin,
};
