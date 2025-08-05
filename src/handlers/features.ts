import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { checkNodeStatus } from './utils/node/nodeStatus';
import logger from './logger';

const prisma = new PrismaClient();

interface ServerInfo {
  serverUUID: string;
  nodeAddress: string;
  nodePort: number;
  nodeKey: string;
}

interface Server {
  UUID: string;
  node: {
    address: string;
    port: number;
    key: string;
  };
}

interface CheckEulaResult {
  accepted: boolean;
  error?: string;
}

export async function checkEulaStatus(
  serverId: string,
): Promise<CheckEulaResult> {
  try {
    const server = (await prisma.server.findUnique({
      where: { UUID: serverId },
      include: { node: true },
    })) as Server | null;

    if (!server) {
      return { accepted: false };
    }

    const isNodeOnline = (await checkNodeStatus(server.node)).status;

    if (isNodeOnline == 'Offline') {
      return { accepted: true };
    }

    const eulaResponse = await axios({
      method: 'GET',
      url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
      responseType: 'text',
      params: { id: server.UUID, path: 'eula.txt' },
      auth: {
        username: 'Airlink',
        password: server.node.key,
      },
    });

    const eulaAccepted = (eulaResponse.data as string).includes(
      'eula=true',
    );
    return { accepted: eulaAccepted };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return { accepted: false };
    }
    return {
      accepted: false,
      error: 'An error occurred while checking the EULA status.',
    };
  }
}

/**
 * Checks if a folder is a valid Minecraft world
 * @param folderName The name of the folder to check
 * @param serverInfo Information about the server
 * @returns True if the folder is a valid Minecraft world, false otherwise
 */
export const isWorld = async (
  folderName: string,
  serverInfo: ServerInfo,
): Promise<boolean> => {
  // Folders that are definitely not Minecraft worlds
  const excludedFolders = [
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
  ];

  // Basic validation
  if (
    typeof folderName !== 'string' ||
    folderName.length === 0 ||
    excludedFolders.includes(folderName.toLowerCase()) ||
    folderName.startsWith('.')
  ) {
    return false;
  }

  try {
    // Get the contents of the folder
    const requestConfig = {
      method: 'GET',
      url: `http://${serverInfo.nodeAddress}:${serverInfo.nodePort}/fs/list?id=${serverInfo.serverUUID}&path=${folderName}`,
      auth: {
        username: 'Airlink',
        password: serverInfo.nodeKey,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 second timeout
    };

    const response = await axios(requestConfig);
    const content = response.data;

    // Files that must be present in a Minecraft world
    const requiredFiles = ['level.dat'];

    // Files that are commonly found in Minecraft worlds
    const commonWorldFiles = [
      'session.lock',
      'region',
      'data',
      'playerdata',
      'stats',
      'advancements',
      'DIM-1',
      'DIM1',
    ];

    // Check if all required files are present
    const hasRequiredFiles = requiredFiles.every((file) =>
      content.some((item: any) => item.name === file),
    );

    // Check if at least one common world file/folder is present
    const hasCommonWorldFiles = commonWorldFiles.some((file) =>
      content.some((item: any) => item.name === file),
    );

    // A valid world must have all required files and at least one common world file/folder
    const isValidWorld = hasRequiredFiles && (content.length > 1 || hasCommonWorldFiles);

    return isValidWorld;
  } catch (error) {
    // Only log error if it's not a connection error (daemon offline)
    if (axios.isAxiosError(error)) {
      if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT' && error.code !== 'ENOTFOUND') {
        logger.error(`Error checking world folder content for ${folderName}:`, error);
      }
    } else {
      logger.error(`Error checking world folder content for ${folderName}:`, error);
    }
    return false;
  }
};
