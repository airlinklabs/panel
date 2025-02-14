import { PrismaClient, Server } from '@prisma/client';
import axios from 'axios';
import logger from '../../logger';
import { ServerUpdateData, ServerCreateData } from '../../../types/express';

const prisma = new PrismaClient();

export class ServerManager {
  static async updateServer(serverId: number, data: ServerUpdateData): Promise<Server> {
    try {
      return await prisma.server.update({
        where: { id: serverId },
        data: {
          name: data.name,
          description: data.description,
          nodeId: data.nodeId,
          Memory: data.Memory,
          Cpu: data.Cpu,
          Storage: data.Storage,
          ownerId: data.ownerId,
        },
      });
    } catch (error) {
      logger.error('Error updating server:', error);
      throw new Error('Failed to update server');
    }
  }

  static async deleteServer(serverId: number, nodeAddress: string, nodePort: number, nodeKey: string): Promise<void> {
    try {
      await axios.delete(
        `http://${nodeAddress}:${nodePort}/container/delete`,
        {
          auth: {
            username: 'Airlink',
            password: nodeKey,
          },
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            id: serverId,
            deleteCmd: 'delete',
          },
        }
      );

      await prisma.server.delete({ where: { id: serverId } });
    } catch (error) {
      logger.error('Error deleting server:', error);
      throw new Error('Failed to delete server');
    }
  }

  static async getServerWithDetails(serverId: number) {
    return await prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        image: true,
        owner: true,
      },
    });
  }
}