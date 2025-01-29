import axios from 'axios';
import { PrismaClient } from '@prisma/client';

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

    const eulaResponse = await axios({
      method: 'GET',
      url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
      params: { id: server.UUID, path: 'eula.txt' },
      auth: {
        username: 'Airlink',
        password: server.node.key,
      },
    });

    const eulaAccepted = (eulaResponse.data.content as string).includes(
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

export const isWorld = async (
  folderName: string,
  serverInfo: ServerInfo,
): Promise<boolean> => {
  const excludedFolders = [
    'plugins',
    'config',
    'cache',
    'versions',
    'logs',
    'libraries',
  ];
  if (
    typeof folderName !== 'string' ||
    folderName.length === 0 ||
    excludedFolders.includes(folderName.toLowerCase())
  ) {
    return false;
  }

  try {
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
    };

    const response = await axios(requestConfig);
    const content = response.data;
    const requiredFiles = ['level.dat'];
    const isValidWorld = requiredFiles.every((file) =>
      content.some((item: any) => item.name === file),
    );

    return isValidWorld;
  } catch (error) {
    console.error(
      `Error checking world folder content for ${folderName}:`,
      error,
    );
    return false;
  }
};
