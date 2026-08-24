import { isHttpError } from '../utils/http';
import prisma from '../db';
import { daemonStateSchema, parseDaemonResponse } from '../platform/daemon/dtos';
import { checkNodeStatus } from './utils/node/nodeStatus';
import { daemonRequest } from './utils/core/daemonRequest';

interface CheckInstallationResult {
  installed: boolean;
  state?: string;
  failed?: boolean;
  error?: string;
}

// In-memory cache so repeated calls within the same request cycle or across
// rapid page navigations don't all hit the daemon independently.
const cache = new Map<string, { state: string; error?: string; timestamp: number }>();
const CACHE_TTL_MS = 8000;

export async function checkForServerInstallation(
  serverId: string,
): Promise<CheckInstallationResult> {
  try {
    const server = await prisma.server.findUnique({
      where: { UUID: serverId },
      include: { node: true },
    });

    if (!server) {
      return { installed: false, error: 'Server not found.' };
    }

    // Fast path: if the DB says it's not installing and not queued, trust it.
    // Avoids an HTTP call to the daemon on every page render for already-running servers.
    if (!server.Installing && !server.Queued) {
      return { installed: true, state: 'installed' };
    }

    const now = Date.now();
    const cached = cache.get(serverId);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return {
        installed: cached.state === 'installed',
        state: cached.state,
        failed: cached.state === 'failed',
        error: cached.error,
      };
    }

    const nodeStatus = await checkNodeStatus(server.node);
    if (nodeStatus.status === 'Offline') {
      return { installed: false, state: 'offline' };
    }

    const response = await daemonRequest<unknown>({
      nodeAddress: server.node.address,
      nodePort: server.node.port,
      nodeKey: server.node.key,
      method: 'GET',
      path: `/container/status/${server.UUID}`,
      timeout: 4000,
    });

    const data = parseDaemonResponse(daemonStateSchema, response.data) ?? {};
    const state = data.state;
    const installError = data.error;
    const isInstalled = state === 'installed';

    cache.set(serverId, { state: state ?? '', error: installError, timestamp: now });

    // Keep the DB in sync so next page load hits the fast path above.
    await prisma.server.update({
      where: { UUID: serverId },
      data: { Installing: !isInstalled },
    });

    return { installed: isInstalled, state, failed: state === 'failed', error: installError };
  } catch (error: any) {
    if (isHttpError(error) && error.status === 404) {
      return { installed: false, state: 'not_found' };
    }
    return { installed: false, error: 'Could not reach daemon.' };
  }
}
