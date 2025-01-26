import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
