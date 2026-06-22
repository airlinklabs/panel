import { ModrinthClient } from './modrinth-client';
import { ModrinthVersion } from '../types/modrinth-api';

export interface UpdateInfo {
  projectId: string;
  projectName: string;
  currentVersionId: string;
  currentVersionNumber: string;
  latestVersionId: string;
  latestVersionNumber: string;
  updateAvailable: boolean;
}

export class UpdateChecker {
  private client: ModrinthClient;
  private logger: any;

  constructor(client: ModrinthClient, logger: any) {
    this.client = client;
    this.logger = logger;
  }

  async checkForUpdate(
    projectId: string,
    currentVersionId: string,
  ): Promise<UpdateInfo | null> {
    try {
      const [project, versions] = await Promise.all([
        this.client.getProject(projectId),
        this.client.getProjectVersions(projectId),
      ]);

      if (!versions.length) return null;

      const currentVersion = versions.find((v) => v.id === currentVersionId);
      const latestVersion = versions[0]; // Versions are ordered by date, newest first

      if (!latestVersion) return null;

      const updateAvailable = latestVersion.id !== currentVersionId;

      return {
        projectId,
        projectName: project.title,
        currentVersionId,
        currentVersionNumber: currentVersion?.version_number || 'unknown',
        latestVersionId: latestVersion.id,
        latestVersionNumber: latestVersion.version_number,
        updateAvailable,
      };
    } catch (error: any) {
      this.logger?.warn(`Failed to check update for project ${projectId}:`, error.message);
      return null;
    }
  }

  async checkMultipleUpdates(
    installations: Array<{ projectId: string; versionId: string }>,
  ): Promise<UpdateInfo[]> {
    const results: UpdateInfo[] = [];

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < installations.length; i += batchSize) {
      const batch = installations.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((inst) => this.checkForUpdate(inst.projectId, inst.versionId)),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value?.updateAvailable) {
          results.push(result.value);
        }
      }

      // Rate limit protection
      if (i + batchSize < installations.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return results;
  }
}
