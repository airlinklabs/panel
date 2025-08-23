import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { checkNodeStatus } from './utils/node/nodeStatus';

const prisma = new PrismaClient();

type CheckInstallationResult = {
    installed: boolean;
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

const cache: Map<string, { data: boolean; timestamp: number }> = new Map();

export async function checkForServerInstallation(
  serverId: string,
): Promise<CheckInstallationResult> {
  try {
    const server = (await prisma.server.findUnique({
      where: { UUID: serverId },
      include: { node: true },
    })) as Server | null;

    if (!server) {
      return { installed: false };
    }

    const isNodeOnline = (await checkNodeStatus(server.node)).status;

    if (isNodeOnline === 'Offline') {
      return { installed: false };
    }

    const cacheEntry = cache.get(serverId);
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.timestamp < 10000) {
      return { installed: cacheEntry.data };
    }

    const response = await axios({
      method: 'GET',
      url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
      responseType: 'text',
      params: { id: server.UUID, path: 'airlink/installed.txt' },
      auth: {
        username: 'Airlink',
        password: server.node.key,
      },
    });

    const isInstalled = (response.data as string).includes('Installed: true');

    cache.set(serverId, { data: isInstalled, timestamp: now });

    await prisma.server.update({
      where: { UUID: serverId },
      data: { Installing: !isInstalled },
    });

    return { installed: isInstalled };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return { installed: false };
    }
    return {
      installed: false,
      error: 'An error occurred while checking the installation status.',
    };
  }
}