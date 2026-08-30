import { isHttpError } from '../utils/http';
import prisma from '../db';
import { fsListSchema, parseDaemonResponse } from '../platform/daemon/dtos';
import { checkNodeStatus } from './utils/node/nodeStatus';
import logger from './logger';
import { daemonRequest } from './utils/core/daemonRequest';

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

export async function checkEulaStatus(
  serverId: string,
): Promise<CheckEulaResult> {
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

    const eulaResponse = await daemonRequest<string>({
      nodeAddress: server.node.address,
      nodePort: server.node.port,
      nodeKey: server.node.key,
      method: 'GET',
      path: '/fs/file/content',
      params: { id: server.UUID, path: 'eula.txt' },
      responseType: 'text',
    });

    return { accepted: (eulaResponse.data as string).includes('eula=true') };
  } catch (error: any) {
    if (isHttpError(error) && error.status === 404) {
      return { accepted: false };
    }
    return {
      accepted: false,
      error: 'An error occurred while checking the EULA status.',
    };
  }
}

const EXCLUDED_WORLD_FOLDERS = new Set([
  'plugins',
  'config',
  'cache',
  'versions',
  'logs',
  'libraries',
  'mods',
  'bin',
  'crash-reports',
  'screenshots',
  'resourcepacks',
  'texturepacks',
  'server',
  'backups',
  'airlink',
]);

const REQUIRED_WORLD_FILES = ['uid.dat', 'level.dat'];
const COMMON_WORLD_FILES = new Set([
  'session.lock',
  'region',
  'data',
  'playerdata',
  'stats',
  'advancements',
  'DIM-1',
  'DIM1',
]);

export const isWorld = async (
  folderName: string,
  serverInfo: ServerInfo,
): Promise<boolean> => {
  if (
    typeof folderName !== 'string' ||
    folderName.length === 0 ||
    EXCLUDED_WORLD_FOLDERS.has(folderName.toLowerCase()) ||
    folderName.startsWith('.')
  ) {
    return false;
  }

  try {
    const response = await daemonRequest<unknown>({
      nodeAddress: serverInfo.nodeAddress,
      nodePort: serverInfo.nodePort,
      nodeKey: serverInfo.nodeKey,
      method: 'GET',
      path: '/fs/list',
      params: { id: serverInfo.serverUUID, path: folderName },
      timeout: 5000,
    });

    const content = parseDaemonResponse(fsListSchema, response.data) ?? [];
    const names = new Set(content.map((item) => item.name));

    const hasRequiredFiles = REQUIRED_WORLD_FILES.some((f) => names.has(f));
    const hasCommonFiles = [...COMMON_WORLD_FILES].some((f) => names.has(f));

    return hasRequiredFiles && (content.length > 1 || hasCommonFiles);
  } catch (error) {
    if (isHttpError(error)) {
      const ignoredCodes = new Set([0]);
      if (!ignoredCodes.has(error.status)) {
        logger.error(
          `Error checking world folder content for ${folderName}:`,
          error,
        );
      }
    } else {
      logger.error(
        `Error checking world folder content for ${folderName}:`,
        error,
      );
    }
    return false;
  }
};
