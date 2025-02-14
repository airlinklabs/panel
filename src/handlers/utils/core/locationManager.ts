import { PrismaClient, Location } from '@prisma/client';
const prisma = new PrismaClient();

export class LocationManager {
  static async createLocation(data: {
		name: string;
		shortCode: string;
		description?: string;
		latitude?: number;
		longitude?: number;
	}): Promise<Location> {
    return await prisma.location.create({
      data
    });
  }

  static async getLocation(id: number): Promise<Location | null> {
    return await prisma.location.findUnique({
      where: { id },
      include: { nodes: true }
    });
  }

  static async getAllLocations(): Promise<Location[]> {
    return await prisma.location.findMany({
      include: { nodes: true }
    });
  }

  static async updateLocation(id: number, data: {
		name?: string;
		shortCode?: string;
		description?: string;
		latitude?: number;
		longitude?: number;
	}): Promise<Location> {
    return await prisma.location.update({
      where: { id },
      data
    });
  }

  static async deleteLocation(id: number): Promise<Location> {
    return await prisma.location.delete({
      where: { id }
    });
  }

  static async getLocationStats(id: number) {
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        nodes: {
          include: {
            servers: true
          }
        }
      }
    });

    if (!location) return null;

    const totalNodes = location.nodes.length;
    const totalServers = location.nodes.reduce((acc, node) => acc + node.servers.length, 0);
    const totalRam = location.nodes.reduce((acc, node) => acc + BigInt(node.ram.toString()), BigInt(0)).toString();  // Use BigInt() instead of literal
    const totalCpu = location.nodes.reduce((acc, node) => acc + BigInt(node.cpu.toString()), BigInt(0)).toString();  // Use BigInt() instead of literal
    const totalDisk = location.nodes.reduce((acc, node) => acc + node.disk, 0);

    return {
      totalNodes,
      totalServers,
      totalRam,
      totalCpu,
      totalDisk
    };
  }
}