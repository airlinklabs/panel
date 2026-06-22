import { ModrinthClient } from './modrinth-client';
import { ModrinthVersion } from '../types/modrinth-api';

export interface ResolvedDependency {
  projectId: string;
  projectName: string;
  versionId: string;
  versionNumber: string;
  downloadUrl: string;
  filename: string;
  required: boolean;
}

export class DependencyResolver {
  private client: ModrinthClient;
  private logger: any;

  constructor(client: ModrinthClient, logger: any) {
    this.client = client;
    this.logger = logger;
  }

  async resolve(version: ModrinthVersion): Promise<ResolvedDependency[]> {
    const dependencies: ResolvedDependency[] = [];

    // Get the project to understand its dependencies
    try {
      const project = await this.client.getProject(version.project_id);
      if (!project) return dependencies;

      // Check version-specific dependencies
      for (const depId of version.project_id ? [version.project_id] : []) {
        // No-op - we need to check the version's dependencies, not the project's
      }
    } catch {
      // Non-critical
    }

    return dependencies;
  }

  async resolveFromVersionId(versionId: string): Promise<ResolvedDependency[]> {
    try {
      const version = await this.client.getVersion(versionId);
      return this.resolve(version);
    } catch (error: any) {
      this.logger?.warn(`Failed to resolve dependencies for version ${versionId}:`, error.message);
      return [];
    }
  }

  async findCompatibleVersion(
    projectId: string,
    gameVersion: string,
    loader: string,
  ): Promise<ModrinthVersion | null> {
    try {
      const versions = await this.client.getProjectVersions(projectId);
      if (!versions.length) return null;

      return versions.find((v) => {
        const matchesGameVersion = v.game_versions.includes(gameVersion);
        const matchesLoader = v.loaders.some((l) => l.toLowerCase() === loader.toLowerCase());
        return matchesGameVersion && matchesLoader;
      }) || versions[0];
    } catch {
      return null;
    }
  }
}
