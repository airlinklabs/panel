import axios from 'axios';
import prisma from '../db';
import { checkNodeStatus } from './utils/node/nodeStatus';
import logger from './logger';

interface ServerInfo {
  serverUUID: string;
  nodeAddress: string;
  nodePort: number;
  nodeKey: string;
}

interface CheckEulaResult {
  accepted: boolean;
  error?: string;
}

export async function checkEulaStatus(serverId: string): Promise<CheckEulaResult> {
  try {
    const server = await prisma.server.findUnique({
      where: { UUID: serverId },
      include: { node: true },
    });

    if (!server) {
      return { accepted: false };
    }

    const nodeStatus = await checkNodeStatus(server.node);
    if (nodeStatus.status === 'Offline') {
      return { accepted: true };
    }

    const eulaResponse = await axios({
      method: 'GET',
      url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
      responseType: 'text',
      params: { id: server.UUID, path: 'eula.txt' },
      auth: { username: 'Airlink', password: server.node.key },
    });

    return { accepted: (eulaResponse.data as string).includes('eula=true') };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { accepted: false };
    }
    return { accepted: false, error: 'An error occurred while checking the EULA status.' };
  }
}

const EXCLUDED_WORLD_FOLDERS = new Set([
  'plugins', 'config', 'cache', 'versions', 'logs', 'libraries',
  'mods', 'bin', 'crash-reports', 'screenshots', 'resourcepacks',
  'texturepacks', 'server', 'backups', 'airlink',
]);

const REQUIRED_WORLD_FILES = ['uid.dat', 'level.dat'];
const COMMON_WORLD_FILES = new Set([
  'session.lock', 'region', 'data', 'playerdata',
  'stats', 'advancements', 'DIM-1', 'DIM1',
]);

export const isWorld = async (folderName: string, serverInfo: ServerInfo): Promise<boolean> => {
  if (
    typeof folderName !== 'string' ||
    folderName.length === 0 ||
    EXCLUDED_WORLD_FOLDERS.has(folderName.toLowerCase()) ||
    folderName.startsWith('.')
  ) {
    return false;
  }

  try {
    const response = await axios({
      method: 'GET',
      url: `http://${serverInfo.nodeAddress}:${serverInfo.nodePort}/fs/list`,
      params: { id: serverInfo.serverUUID, path: folderName },
      auth: { username: 'Airlink', password: serverInfo.nodeKey },
      timeout: 5000,
    });

    const content: Array<{ name: string }> = response.data;
    const names = new Set(content.map((item) => item.name));

    const hasRequiredFiles = REQUIRED_WORLD_FILES.some((f) => names.has(f));
    const hasCommonFiles = [...COMMON_WORLD_FILES].some((f) => names.has(f));

    return hasRequiredFiles && (content.length > 1 || hasCommonFiles);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const ignoredCodes = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']);
      if (!ignoredCodes.has(error.code || '')) {
        logger.error(`Error checking world folder content for ${folderName}:`, error);
      }
    } else {
      logger.error(`Error checking world folder content for ${folderName}:`, error);
    }
    return false;
  }
};
