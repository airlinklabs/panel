import axios from 'axios';
import prisma from '../db';
import { checkNodeStatus } from './utils/node/nodeStatus';

type CheckInstallationResult = {
  installed: boolean;
  state?: string;
  failed?: boolean;
  error?: string;
};

const cache: Map<string, { data: string; timestamp: number }> = new Map();
const CACHE_TTL = 10000;

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

    const nodeStatus = await checkNodeStatus(server.node);
    if (nodeStatus.status === 'Offline') {
      return { installed: false, state: 'offline' };
    }

    const now = Date.now();
    const cached = cache.get(serverId);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return {
        installed: cached.data === 'installed',
        state: cached.data,
        failed: cached.data === 'failed',
      };
    }

    const response = await axios.get(
      `http://${server.node.address}:${server.node.port}/container/status/${server.UUID}`,
      {
        auth: { username: 'Airlink', password: server.node.key },
        timeout: 5000,
      },
    );

    const state = response.data.state as string;
    const isInstalled = state === 'installed';

    cache.set(serverId, { data: state, timestamp: now });

    await prisma.server.update({
      where: { UUID: serverId },
      data: { Installing: !isInstalled },
    });

    return { installed: isInstalled, state, failed: state === 'failed' };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { installed: false, state: 'not_found' };
    }
    return {
      installed: false,
      error: 'An error occurred while checking the installation status.',
    };
  }
}
