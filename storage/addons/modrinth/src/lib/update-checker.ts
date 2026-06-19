// ── Update Checker ──
// Checks for updates on installed mods by comparing versions.

import type { AddonLogger, AddonPrisma } from '../types/panel';
import type { ModrinthClient } from './modrinth-client';

interface InstalledMod {
  projectId: string;
  projectName: string | null;
  versionId: string | null;
  serverId: string;
}

interface UpdateInfo {
  projectId: string;
  projectName: string;
  currentVersionId: string;
  latestVersionId: string;
  latestVersionNumber: string;
  serverId: string;
}

export class UpdateChecker {
  private logger: AddonLogger;
  private prisma: AddonPrisma;
  private modrinth: ModrinthClient;

  constructor(logger: AddonLogger, prisma: AddonPrisma, modrinth: ModrinthClient) {
    this.logger = logger;
    this.prisma = prisma;
    this.modrinth = modrinth;
  }

  /**
   * Check for updates on all installed mods for a server.
   */
  async checkForServer(serverId: string): Promise<UpdateInfo[]> {
    const installed = await this.prisma.$queryRaw<InstalledMod[]>`
      SELECT DISTINCT projectId, projectName, versionId, serverId
      FROM ModrinthInstallation
      WHERE serverId = ${serverId} AND status = 'completed'
    `;

    const updates: UpdateInfo[] = [];

    for (const mod of installed) {
      if (!mod.versionId) continue;

      try {
        const update = await this.checkMod(mod);
        if (update) updates.push(update);
      } catch (error: any) {
        this.logger.warn(`Failed to check update for ${mod.projectId}: ${error.message}`);
      }
    }

    return updates;
  }

  /**
   * Check if a specific mod has an update available.
   */
  async checkMod(mod: InstalledMod): Promise<UpdateInfo | null> {
    if (!mod.versionId || !mod.projectId) return null;

    try {
      // Get the project's latest versions
      const versions = await this.modrinth.getProjectVersions(mod.projectId);
      if (versions.length === 0) return null;

      // Find the latest version (prefer release > beta > alpha)
      const typeOrder: Record<string, number> = { release: 0, beta: 1, alpha: 2 };
      const sorted = versions.sort((a, b) =>
        (typeOrder[a.version_type] ?? 3) - (typeOrder[b.version_type] ?? 3)
      );

      const latest = sorted[0];
      if (latest.id === mod.versionId) return null; // Already on latest

      return {
        projectId: mod.projectId,
        projectName: mod.projectName ?? mod.projectId,
        currentVersionId: mod.versionId,
        latestVersionId: latest.id,
        latestVersionNumber: latest.version_number,
        serverId: mod.serverId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check for updates across all servers.
   */
  async checkAll(): Promise<UpdateInfo[]> {
    // Get all unique server IDs with installations
    const servers = await this.prisma.$queryRaw<Array<{ serverId: string }>>`
      SELECT DISTINCT serverId FROM ModrinthInstallation WHERE status = 'completed'
    `;

    const allUpdates: UpdateInfo[] = [];
    for (const { serverId } of servers) {
      if (!serverId) continue;
      const updates = await this.checkForServer(serverId);
      allUpdates.push(...updates);
    }

    return allUpdates;
  }
}
