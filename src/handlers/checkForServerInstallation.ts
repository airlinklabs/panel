import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { checkNodeStatus } from './utils/node/nodeStatus';

const prisma = new PrismaClient();

type CheckInstallationResult = {
  installed: boolean;
  state?: string;
  failed?: boolean;
  error?: string;
};

interface Server {
  UUID: string;
  node: {
    address: string;
    port: number;
    key: string;
  };
}

const cache: Map<string, { data: string; timestamp: number }> = new Map();

export async function checkForServerInstallation(
  serverId: string,
): Promise<CheckInstallationResult> {
  try {
    const server = (await prisma.server.findUnique({
      where: { UUID: serverId },
      include: { node: true },
    })) as Server | null;

    if (!server) {
      return { installed: false, error: 'Server not found.' };
    }

    const isNodeOnline = (await checkNodeStatus(server.node)).status;
    if (isNodeOnline === 'Offline') {
      return { installed: false, state: 'offline' };
    }

    const cacheEntry = cache.get(serverId);
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.timestamp < 10000) {
      const isInstalled = cacheEntry.data === 'installed';
      return {
        installed: isInstalled,
        state: cacheEntry.data,
        failed: cacheEntry.data === 'failed',
      };
    }

    const response = await axios.get(
      `http://${server.node.address}:${server.node.port}/container/status/${server.UUID}`,
      {
        auth: {
          username: 'Airlink',
          password: server.node.key,
        },
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

    return {
      installed: isInstalled,
      state,
      failed: state === 'failed',
    };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return { installed: false, state: 'not_found' };
    }

    console.error('Error checking server installation:', error);
    return {
      installed: false,
      error: 'An error occurred while checking the installation status.',
    };
  }
}
