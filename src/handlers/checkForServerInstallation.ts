import axios from 'axios';
import prisma from '../db';
import { checkNodeStatus } from './utils/node/nodeStatus';

type CheckInstallationResult = {
  installed: boolean;
  state?: string;
  failed?: boolean;
  error?: string;
};

// In-memory cache so repeated calls within the same request cycle or across
// rapid page navigations don't all hit the daemon independently.
const cache = new Map<string, { data: string; timestamp: number }>();
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
        installed: cached.data === 'installed',
        state: cached.data,
        failed: cached.data === 'failed',
      };
    }

    const nodeStatus = await checkNodeStatus(server.node);
    if (nodeStatus.status === 'Offline') {
      return { installed: false, state: 'offline' };
    }

    const response = await axios.get(
      `http://${server.node.address}:${server.node.port}/container/status/${server.UUID}`,
      { auth: { username: 'Airlink', password: server.node.key }, timeout: 4000 },
    );

    const state = response.data.state as string;
    const isInstalled = state === 'installed';

    cache.set(serverId, { data: state, timestamp: now });

    // Keep the DB in sync so next page load hits the fast path above.
    await prisma.server.update({
      where: { UUID: serverId },
      data: { Installing: !isInstalled },
    });

    return { installed: isInstalled, state, failed: state === 'failed' };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { installed: false, state: 'not_found' };
    }
    return { installed: false, error: 'Could not reach daemon.' };
  }
}
