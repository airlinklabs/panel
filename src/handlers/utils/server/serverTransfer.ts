import prisma from '../../../db';
import type { Prisma } from '../../../generated/prisma/client';
import logger from '../../logger';
import { daemonRequest } from '../core/daemonRequest';
import {
  claimNodePorts,
  getNodePortPool,
  releaseServerAllocations,
  withNodePortLock,
} from './allocations';
import { assertNodeCapacity } from './resourceCheck';
import {
  normalizeServerPorts,
  parseImagePortRequirements,
  parseServerPorts,
  serializeServerPorts,
  validatePortAssignments,
  getUsedExternalPorts,
} from './ports';

export type TransferStatus =
  | 'pending'
  | 'stopping'
  | 'archiving'
  | 'transferring'
  | 'restoring'
  | 'installing'
  | 'updating-db'
  | 'starting'
  | 'completed'
  | 'failed';

export interface TransferState {
  serverId: number;
  serverUUID: string;
  serverName: string;
  sourceNodeId: number;
  targetNodeId: number;
  status: TransferStatus;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const transferStates = new Map<number, TransferState>();

export function getTransferState(serverId: number): TransferState | undefined {
  return transferStates.get(serverId);
}

function updateStatus(serverId: number, status: TransferStatus, error?: string): void {
  const state = transferStates.get(serverId);
  if (state) {
    state.status = status;
    state.error = error;
    if (status === 'completed' || status === 'failed') {
      state.completedAt = new Date();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInstall(daemon: { address: string; port: number; key: string }, serverUUID: string, maxWaitMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await daemonRequest<{ status?: string }>({
        nodeAddress: daemon.address,
        nodePort: daemon.port,
        nodeKey: daemon.key,
        method: 'GET',
        path: `/container/status/${serverUUID}`,
        timeout: 10_000,
      });
      const st = res.data?.status;
      if (st === 'installed' || st === 'exited' || st === 'running') return;
      if (st === 'failed') throw new Error('Install failed on destination daemon');
    } catch {
      // daemon might not know the container yet — keep polling
    }
    await sleep(3000);
  }
  throw new Error('Install timed out on destination daemon');
}

export async function startTransfer(
  serverId: number,
  targetNodeId: number,
  targetPorts: { externalPort: number; internalPort: number; primary: boolean; name: string }[],
  req: { session?: { user?: { id?: number } } },
): Promise<TransferState> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true, image: true },
  });
  if (!server) throw new Error('Server not found');
  if (server.Installing) throw new Error('Server is currently installing');
  if (server.Suspended) throw new Error('Suspended servers cannot be transferred');
  if (server.nodeId === targetNodeId) throw new Error('Server is already on this node');

  const targetNode = await prisma.node.findUnique({ where: { id: targetNodeId } });
  if (!targetNode) throw new Error('Target node not found');

  // Validate target ports are available
  const pool = await getNodePortPool(targetNodeId);
  const otherServers = await prisma.server.findMany({ where: { nodeId: targetNodeId } });
  const image = server.image;
  const minPorts = image ? parseImagePortRequirements(image.portRequirements).length : 0;
  const portError = validatePortAssignments(targetPorts, pool, getUsedExternalPorts(otherServers), minPorts);
  if (portError) throw new Error(portError);

  // Check capacity on target
  await assertNodeCapacity(targetNode, server.Memory, server.Cpu, server.Storage, server.UUID);

  const state: TransferState = {
    serverId: server.id,
    serverUUID: server.UUID,
    serverName: server.name,
    sourceNodeId: server.nodeId,
    targetNodeId,
    status: 'pending',
    startedAt: new Date(),
  };
  transferStates.set(serverId, state);

  // Run the transfer in background — the UI polls /transfer/status
  runTransfer(server, targetNode, targetPorts, state, req).catch((err) => {
    logger.error(`Transfer failed for server ${server.UUID}:`, err);
    updateStatus(serverId, 'failed', err instanceof Error ? err.message : 'Unknown error');
  });

  return state;
}

type ServerWithRelations = Prisma.ServerGetPayload<{ include: { node: true; image: true } }>;

async function runTransfer(
  server: ServerWithRelations,
  targetNode: { id: number; address: string; port: number; key: string },
  targetPorts: { externalPort: number; internalPort: number; primary: boolean; name: string }[],
  state: TransferState,
  req: { session?: { user?: { id?: number } } },
): Promise<void> {
  const srcDaemon = server.node;
  let backupFilePath: string | undefined;

  try {
    // ── Step 1: Stop source container ──────────────────────────────────────
    updateStatus(state.serverId, 'stopping');
    try {
      await daemonRequest({
        nodeAddress: srcDaemon.address,
        nodePort: srcDaemon.port,
        nodeKey: srcDaemon.key,
        method: 'POST',
        path: '/container/stop',
        body: { id: server.UUID, stopCmd: 'stop' },
        timeout: 30_000,
      });
    } catch {
      // Container might already be stopped — continue
    }
    await sleep(2000); // Wait for container to fully stop

    // ── Step 2: Create backup on source daemon ─────────────────────────────
    updateStatus(state.serverId, 'archiving');
    const backupRes = await daemonRequest<{
      success?: boolean;
      backup?: { uuid: string; filePath: string; size: number; checksum: string };
      error?: string;
    }>({
      nodeAddress: srcDaemon.address,
      nodePort: srcDaemon.port,
      nodeKey: srcDaemon.key,
      method: 'POST',
      path: '/container/backup',
      body: { id: server.UUID, name: `transfer-${Date.now()}` },
      timeout: 300_000,
    });

    if (!backupRes.data?.backup?.filePath) {
      throw new Error(`Failed to create backup on source: ${backupRes.data?.error || 'Unknown error'}`);
    }
    backupFilePath = backupRes.data.backup.filePath;
    const backupChecksum = backupRes.data.backup.checksum;

    // ── Step 3: Download from source daemon ────────────────────────────────
    // ── Step 4: Upload to destination daemon ───────────────────────────────
    updateStatus(state.serverId, 'transferring');
    const backupUuid = backupRes.data.backup.uuid;

    // Stream backup from source
    const downloadRes = await daemonRequest<ReadableStream>({
      nodeAddress: srcDaemon.address,
      nodePort: srcDaemon.port,
      nodeKey: srcDaemon.key,
      method: 'GET',
      path: '/container/backup/download',
      params: { backupPath: backupFilePath },
      responseType: 'stream',
      timeout: 600_000,
    });

    if (!downloadRes.data) {
      throw new Error('Failed to download backup from source daemon');
    }

    // Upload to destination daemon
    const uploadRes = await daemonRequest<{ success?: boolean; filePath?: string; error?: string }>({
      nodeAddress: targetNode.address,
      nodePort: targetNode.port,
      nodeKey: targetNode.key,
      method: 'POST',
      path: '/container/backup/upload',
      params: { id: server.UUID, backupUuid },
      body: downloadRes.data,
      contentDigest: backupChecksum,
      timeout: 600_000,
    });

    if (!uploadRes.data?.success) {
      throw new Error(`Failed to upload backup to destination: ${uploadRes.data?.error || 'Unknown error'}`);
    }

    // ── Step 5: Restore backup on destination daemon ───────────────────────
    updateStatus(state.serverId, 'restoring');
    const restoreRes = await daemonRequest<{ success?: boolean; error?: string }>({
      nodeAddress: targetNode.address,
      nodePort: targetNode.port,
      nodeKey: targetNode.key,
      method: 'POST',
      path: '/container/restore',
      body: {
        id: server.UUID,
        backupPath: uploadRes.data.filePath,
        checksum: backupChecksum,
      },
      timeout: 300_000,
    });

    if (!restoreRes.data?.success) {
      throw new Error(`Failed to restore backup on destination: ${restoreRes.data?.error || 'Unknown error'}`);
    }

    // ── Step 6: Install server on destination (pull image + scripts) ───────
    updateStatus(state.serverId, 'installing');

    // Parse variables for env
    let env: Record<string, string> = {};
    if (server.Variables) {
      try {
        const vars = JSON.parse(server.Variables);
        const normalized = vars.map((v: Record<string, unknown>) => ({
          env: String(v.env_variable ?? v.env ?? ''),
          value: v.value ?? v.default_value ?? '',
        }));
        env = Object.fromEntries(normalized.map((v: { env: string; value: unknown }) => [v.env, String(v.value)]));

        // Add SERVER_PORT from ports
        try {
          const parsedPorts = JSON.parse(server.Ports) as Array<{ primary?: boolean; Port?: string; externalPort?: number }>;
          const primary = parsedPorts.find((p) => p.primary);
          if (primary?.Port) {
            env['SERVER_PORT'] = String(primary.externalPort || String(primary.Port).split(':')[0]);
          }
        } catch { /* keep fallback */ }
        env['SERVER_MEMORY'] = String(server.Memory);
        env['SERVER_CPU'] = String(server.Cpu);
      } catch { /* keep empty env */ }
    }

    let dockerImageValue: string | undefined;
    try {
      const parsed = JSON.parse(server.dockerImage || '{}');
      dockerImageValue = Object.values(parsed)[0] as string | undefined;
    } catch { /* leave undefined */ }

    // Determine install method from image scripts
    const image = server.image;
    if (image?.scripts) {
      let scripts: Record<string, unknown>;
      try { scripts = JSON.parse(image.scripts); } catch { scripts = {}; }

      if (scripts.installation && typeof scripts.installation === 'object') {
        const installation = scripts.installation as { script: string; container: string; entrypoint: string };
        await daemonRequest({
          nodeAddress: targetNode.address,
          nodePort: targetNode.port,
          nodeKey: targetNode.key,
          method: 'POST',
          path: '/container/installer',
          body: {
            id: server.UUID,
            script: installation.script,
            container: installation.container,
            entrypoint: installation.entrypoint || 'bash',
            env,
          },
          timeout: 600_000,
        });
      } else if (Array.isArray(scripts.install)) {
        await daemonRequest({
          nodeAddress: targetNode.address,
          nodePort: targetNode.port,
          nodeKey: targetNode.key,
          method: 'POST',
          path: '/container/install',
          body: {
            id: server.UUID,
            image: dockerImageValue,
            env,
            scripts: (scripts.install as Array<{ url?: string; onStart?: string; ALVKT?: string; fileName?: string }>).map((s) => ({
              url: s.url,
              onStartup: s.onStart,
              ALVKT: s.ALVKT,
              fileName: s.fileName,
            })),
          },
          timeout: 600_000,
        });
      }
    }

    // Wait for install to complete
    await waitForInstall(targetNode, server.UUID);

    // ── Step 7: Update database ────────────────────────────────────────────
    updateStatus(state.serverId, 'updating-db');
    const newPorts = serializeServerPorts(targetPorts);

    await withNodePortLock(targetNode.id, async () => {
      // Release old allocations
      await releaseServerAllocations(server.UUID);

      // Update server record
      await prisma.server.update({
        where: { id: server.id },
        data: {
          nodeId: targetNode.id,
          Ports: newPorts,
        },
      });

      // Claim new ports
      await claimNodePorts(targetNode.id, targetPorts.map((p) => p.externalPort), server.UUID);
    });

    // ── Step 8: Start server on destination ────────────────────────────────
    updateStatus(state.serverId, 'starting');
    try {
      let configFiles: unknown;
      if (server.image?.config_files) {
        try {
          configFiles = JSON.parse(server.image.config_files);
        } catch {
          configFiles = undefined;
        }
      }
      await daemonRequest({
        nodeAddress: targetNode.address,
        nodePort: targetNode.port,
        nodeKey: targetNode.key,
        method: 'POST',
        path: '/container/start',
        body: {
          id: server.UUID,
          image: dockerImageValue,
          env,
          scripts: image?.scripts ? JSON.parse(image.scripts) : undefined,
          StartCommand: server.image?.startup,
          Memory: server.Memory,
          Cpu: server.Cpu,
          Swap: 0,
          Storage: server.Storage,
          configFiles,
        },
        timeout: 60_000,
      });
    } catch (startErr) {
      logger.warn(`Failed to start server after transfer: ${startErr}`);
      // Don't fail the transfer — server is migrated, just not running
    }

    // ── Step 9: Clean up backup on source ──────────────────────────────────
    if (backupFilePath) {
      try {
        await daemonRequest({
          nodeAddress: srcDaemon.address,
          nodePort: srcDaemon.port,
          nodeKey: srcDaemon.key,
          method: 'DELETE',
          path: '/container/backup',
          body: { backupPath: backupFilePath },
          timeout: 30_000,
        });
      } catch {
        // Non-critical — backup cleanup failure doesn't break transfer
      }
    }

    updateStatus(state.serverId, 'completed');
    logger.info(`Server ${server.UUID} transferred from node ${srcDaemon.id} to node ${targetNode.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    updateStatus(state.serverId, 'failed', msg);
    logger.error(`Transfer failed for ${server.UUID}:`, err);

    // Attempt cleanup: delete backup on source if it was created
    if (backupFilePath) {
      try {
        await daemonRequest({
          nodeAddress: srcDaemon.address,
          nodePort: srcDaemon.port,
          nodeKey: srcDaemon.key,
          method: 'DELETE',
          path: '/container/backup',
          body: { backupPath: backupFilePath },
          timeout: 30_000,
        });
      } catch { /* best effort */ }
    }
  }
}
