// ── Dependency Resolver ──
// Resolves required dependencies from Modrinth version data.
// Finds compatible versions by matching game versions and loaders.

import type { AddonLogger } from '../types/panel';
import type { ModrinthClient } from './modrinth-client';
import type { ModrinthVersion, ModrinthProject } from '../types/modrinth';

interface ResolvedDependency {
  projectId: string;
  versionId: string;
  fileName: string;
  downloadUrl: string;
}

export class DependencyResolver {
  private logger: AddonLogger;
  private modrinth: ModrinthClient;

  constructor(logger: AddonLogger, modrinth: ModrinthClient) {
    this.logger = logger;
    this.modrinth = modrinth;
  }

  /**
   * Resolve all required dependencies for a version.
   * Returns an array of resolved dependencies with download URLs.
   */
  async resolveDependencies(
    version: ModrinthVersion,
    gameVersions: string[],
    loaders: string[]
  ): Promise<ResolvedDependency[]> {
    if (!version.dependencies || version.dependencies.length === 0) {
      return [];
    }

    const resolved: ResolvedDependency[] = [];
    const visited = new Set<string>();

    for (const dep of version.dependencies) {
      if (dep.dependency_type !== 'required') continue;
      if (visited.has(dep.project_id)) continue;
      visited.add(dep.project_id);

      try {
        const result = await this.resolveDependency(dep.project_id, dep.version_id ?? undefined, gameVersions, loaders);
        if (result) {
          resolved.push(result);
          // Recursively resolve transitive dependencies
          const version = await this.modrinth.getVersion(result.versionId);
          const transitive = await this.resolveDependencies(version, gameVersions, loaders);
          for (const t of transitive) {
            if (!visited.has(t.projectId)) {
              visited.add(t.projectId);
              resolved.push(t);
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`Failed to resolve dependency ${dep.project_id}: ${error.message}`);
      }
    }

    return resolved;
  }

  /**
   * Resolve a single dependency.
   */
  private async resolveDependency(
    projectId: string,
    preferredVersionId: string | undefined,
    gameVersions: string[],
    loaders: string[]
  ): Promise<ResolvedDependency | null> {
    // If a specific version is pinned, use it
    if (preferredVersionId) {
      try {
        const version = await this.modrinth.getVersion(preferredVersionId);
        const primaryFile = version.files.find(f => f.primary) ?? version.files[0];
        if (primaryFile) {
          return {
            projectId,
            versionId: version.id,
            fileName: primaryFile.filename,
            downloadUrl: primaryFile.url,
          };
        }
      } catch {
        // Version not found, try to find compatible one
      }
    }

    // Find a compatible version
    try {
      const versions = await this.modrinth.getProjectVersions(projectId, loaders, gameVersions);
      if (versions.length === 0) {
        this.logger.warn(`No compatible versions found for dependency ${projectId}`);
        return null;
      }

      // Prefer release versions, then beta, then alpha
      const sorted = versions.sort((a, b) => {
        const typeOrder: Record<string, number> = { release: 0, beta: 1, alpha: 2 };
        return (typeOrder[a.version_type] ?? 3) - (typeOrder[b.version_type] ?? 3);
      });

      const best = sorted[0];
      const primaryFile = best.files.find(f => f.primary) ?? best.files[0];
      if (!primaryFile) return null;

      return {
        projectId,
        versionId: best.id,
        fileName: primaryFile.filename,
        downloadUrl: primaryFile.url,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to find compatible version for dependency ${projectId}: ${error.message}`);
      return null;
    }
  }
}
