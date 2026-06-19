// ── Modpack Installer ──
// Handles installation of mods, modpacks, and other project types.
// Uses path sanitization, URL validation, typed Prisma queries, and streaming.

import AdmZip from 'adm-zip';
import type { AddonLogger, AddonPrisma, AddonServerData, AddonSecurity } from '../types/panel';
import type { ModrinthClient } from './modrinth-client';
import type { DaemonClient } from './daemon-client';
import { progressTracker } from './progress-tracker';
import type { ModrinthProject, ModrinthVersion, ProjectType } from '../types/modrinth';
import { PROJECT_TYPE_DIRS, ALLOWED_MODRINTH_DOMAINS } from '../types/modrinth';

/** Known client-only mods to skip during modpack installation */
const CLIENT_ONLY_MODS = new Set([
  'optifine', 'sodium', 'lithium', 'phosphor', 'starlight',
  'iris', 'shaders', 'modmenu', 'jei', 'roughlyenoughitems',
  'craftpresence', 'presencefootsteps', 'soundphysics',
]);

/** Files to skip when installing overrides */
const SKIP_OVERRIDE_PATTERNS = [/^__MACOSX\//, /\.DS_Store$/, /^Thumbs\.db$/];

interface InstallerDependencies {
  logger: AddonLogger;
  prisma: AddonPrisma;
  security: AddonSecurity;
  modrinth: ModrinthClient;
  daemon: DaemonClient;
}

export class Installer {
  private logger: AddonLogger;
  private prisma: AddonPrisma;
  private security: AddonSecurity;
  private modrinth: ModrinthClient;
  private daemon: DaemonClient;

  constructor(deps: InstallerDependencies) {
    this.logger = deps.logger;
    this.prisma = deps.prisma;
    this.security = deps.security;
    this.modrinth = deps.modrinth;
    this.daemon = deps.daemon;
  }

  /**
   * Install a single file (mod, plugin, shader, resource pack, datapack).
   */
  async installSingleFile(
    project: ModrinthProject,
    version: ModrinthVersion,
    server: AddonServerData
  ): Promise<void> {
    const serverUUID = server.UUID;
    const projectType = project.project_type as ProjectType;
    const destDir = PROJECT_TYPE_DIRS[projectType] ?? 'mods';

    // Find the primary file
    const primaryFile = version.files.find(f => f.primary) ?? version.files[0];
    if (!primaryFile) {
      throw new Error('No files found in version');
    }

    // Validate download URL
    if (!this.security.validateUrl(primaryFile.url, ALLOWED_MODRINTH_DOMAINS)) {
      throw new Error(`Invalid download URL: ${primaryFile.url}`);
    }

    // Initialize progress
    progressTracker.initialize(serverUUID, project.id, project.title, 1);
    progressTracker.updateStage(serverUUID, project.id, 'downloading', project.title);

    try {
      // Download the file
      const buffer = await this.modrinth.downloadFile(primaryFile.url);

      // Verify hash if available
      const sha1 = primaryFile.hashes['sha1'];
      if (sha1) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha1').update(buffer).digest('hex');
        if (hash !== sha1) {
          throw new Error(`Hash mismatch: expected ${sha1}, got ${hash}`);
        }
      }

      progressTracker.updateStage(serverUUID, project.id, 'processing');

      // Upload to server via daemon
      const destination = `${destDir}/${primaryFile.filename}`;
      const result = await this.daemon.uploadFile(serverUUID, destination, buffer);
      if (!result.success) {
        throw new Error(`Failed to upload file: ${result.error}`);
      }

      progressTracker.updateMod(serverUUID, project.id, project.id, 'completed');
      progressTracker.updateStage(serverUUID, project.id, 'finalizing');

      // Record installation in DB
      await this.recordInstallation(project, version, serverUUID, 'completed');

      progressTracker.complete(serverUUID, project.id);
    } catch (error: any) {
      progressTracker.updateMod(serverUUID, project.id, project.id, 'failed', error.message);
      progressTracker.addError(serverUUID, project.id, error.message);
      await this.recordInstallation(project, version, serverUUID, 'failed', error.message);
      progressTracker.fail(serverUUID, project.id, error.message);
      throw error;
    }
  }

  /**
   * Install a modpack from a .mrpack file buffer.
   */
  async installModpack(
    modpackBuffer: Buffer,
    project: ModrinthProject,
    version: ModrinthVersion,
    server: AddonServerData
  ): Promise<void> {
    const serverUUID = server.UUID;

    progressTracker.initialize(serverUUID, project.id, project.title, 0);
    progressTracker.updateStage(serverUUID, project.id, 'downloading', 'Parsing modpack');

    try {
      const zip = new AdmZip(modpackBuffer);
      const entries = zip.getEntries();

      // Find and parse the modrinth index
      const indexEntry = entries.find(e => e.entryName === 'modrinth.index.json');
      if (!indexEntry) {
        throw new Error('Invalid modpack: modrinth.index.json not found');
      }

      let index: {
        files: Array<{
          path: string;
          hashes: Record<string, string>;
          downloads: string[];
          fileSize: number;
        }>;
        overrides?: string;
      };

      try {
        index = JSON.parse(indexEntry.getData().toString('utf-8'));
      } catch {
        throw new Error('Invalid modpack: modrinth.index.json is not valid JSON');
      }

      if (!index.files || !Array.isArray(index.files)) {
        throw new Error('Invalid modpack: no files array in index');
      }

      // Filter to server-side mods only
      const serverFiles = index.files.filter(f => {
        const path = f.path.toLowerCase();
        // Skip client-only mods
        for (const clientMod of CLIENT_ONLY_MODS) {
          if (path.includes(clientMod)) return false;
        }
        // Only include mods/, plugins/, shaderpacks/, resourcepacks/, datapacks/
        return path.startsWith('mods/') || path.startsWith('plugins/') ||
               path.startsWith('shaderpacks/') || path.startsWith('resourcepacks/') ||
               path.startsWith('world/datapacks/');
      });

      const totalMods = serverFiles.length;
      progressTracker.updateStage(serverUUID, project.id, 'installing_mods');
      progressTracker.updateStage(serverUUID, project.id, 'installing_mods', `0/${totalMods} mods`);

      // Download and install mods concurrently (5 workers)
      let completedCount = 0;
      const errors: string[] = [];

      const downloadNext = async (idx: number): Promise<void> => {
        while (idx < serverFiles.length) {
          const file = serverFiles[idx];
          idx++;

          const filename = file.path.split('/').pop() ?? file.path;
          const destPath = file.path;

          try {
            // Find a working download URL
            let downloaded = false;
            for (const url of file.downloads) {
              if (!this.security.validateUrl(url, ALLOWED_MODRINTH_DOMAINS)) continue;

              try {
                const buffer = await this.modrinth.downloadFile(url);

                // Verify hash
                const sha1 = file.hashes['sha1'];
                if (sha1) {
                  const crypto = require('crypto');
                  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
                  if (hash !== sha1) {
                    this.logger.warn(`Hash mismatch for ${filename}, skipping`);
                    continue;
                  }
                }

                const result = await this.daemon.uploadFile(serverUUID, destPath, buffer);
                if (!result.success) {
                  throw new Error(`Upload failed: ${result.error}`);
                }

                downloaded = true;
                break;
              } catch {
                continue;
              }
            }

            if (!downloaded) {
              progressTracker.addWarning(serverUUID, project.id, `Failed to download: ${filename}`);
            }
          } catch (error: any) {
            errors.push(`${filename}: ${error.message}`);
            progressTracker.addError(serverUUID, project.id, `${filename}: ${error.message}`);
          }

          completedCount++;
          progressTracker.updateStage(
            serverUUID,
            project.id,
            'installing_mods',
            `${completedCount}/${totalMods} mods`
          );
        }
      };

      // Launch workers
      const workers = [];
      for (let i = 0; i < Math.min(5, serverFiles.length); i++) {
        workers.push(downloadNext(i));
      }
      await Promise.all(workers);

      // Install overrides
      const overridesDir = index.overrides ?? 'overrides';
      progressTracker.updateStage(serverUUID, project.id, 'installing_overrides');

      const overrideEntries = entries.filter(e =>
        e.entryName.startsWith(`${overridesDir}/`) &&
        !e.isDirectory &&
        !SKIP_OVERRIDE_PATTERNS.some(p => p.test(e.entryName))
      );

      for (const entry of overrideEntries) {
        const relativePath = entry.entryName.slice(overridesDir.length + 1);
        if (!relativePath) continue;

        // Sanitize the override path
        const sanitized = this.security.sanitizePath('/', relativePath);
        if (sanitized === null) {
          this.logger.warn(`Skipping override with invalid path: ${relativePath}`);
          continue;
        }

        const buffer = entry.getData();
        const result = await this.daemon.uploadFile(serverUUID, relativePath, buffer);
        if (!result.success) {
          this.logger.warn(`Failed to upload override ${relativePath}: ${result.error}`);
        }
      }

      // Finalize
      progressTracker.updateStage(serverUUID, project.id, 'finalizing');

      await this.recordInstallation(project, version, serverUUID, 'completed');

      if (errors.length > 0) {
        progressTracker.addWarning(serverUUID, project.id, `${errors.length} mods failed to install`);
      }

      progressTracker.complete(serverUUID, project.id);
    } catch (error: any) {
      progressTracker.addError(serverUUID, project.id, error.message);
      await this.recordInstallation(project, version, serverUUID, 'failed', error.message);
      progressTracker.fail(serverUUID, project.id, error.message);
      throw error;
    }
  }

  /**
   * Uninstall a mod from a server.
   */
  async uninstallMod(
    projectId: string,
    serverId: string,
    projectName: string,
    projectType: ProjectType
  ): Promise<void> {
    // Find the installation record
    const installations = await this.prisma.$queryRaw<Array<{
      id: number;
      projectId: string;
      versionId: string | null;
      serverId: string;
    }>>`
      SELECT id, projectId, versionId, serverId
      FROM ModrinthInstallation
      WHERE projectId = ${projectId} AND serverId = ${serverId} AND status = 'completed'
      LIMIT 1
    `;

    if (installations.length === 0) {
      throw new Error('No installation found for this project on this server');
    }

    const installation = installations[0];
    const destDir = PROJECT_TYPE_DIRS[projectType] ?? 'mods';

    // Try to find and delete the file from the server
    // We need to know the filename — try to get it from the version
    if (installation.versionId) {
      try {
        const version = await this.modrinth.getVersion(installation.versionId);
        const primaryFile = version.files.find(f => f.primary) ?? version.files[0];
        if (primaryFile) {
          const filePath = `${destDir}/${primaryFile.filename}`;
          await this.daemon.deleteFile(serverId, filePath);
        }
      } catch (error: any) {
        this.logger.warn(`Could not delete file from server: ${error.message}`);
      }
    }

    // Update the installation record
    await this.prisma.$executeRaw`
      UPDATE ModrinthInstallation
      SET status = 'failed', error = 'Uninstalled'
      WHERE id = ${installation.id}
    `;
  }

  /**
   * Record an installation in the database.
   * Uses parameterized queries (no raw SQL injection).
   */
  private async recordInstallation(
    project: ModrinthProject,
    version: ModrinthVersion,
    serverId: string,
    status: 'completed' | 'failed' | 'in_progress',
    error?: string
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ModrinthInstallation
          (projectId, projectType, projectName, versionId, serverId, status, error)
        VALUES
          (${project.id}, ${project.project_type}, ${project.title}, ${version.id}, ${serverId}, ${status}, ${error ?? null})
      `;
    } catch (err: any) {
      this.logger.error(`Failed to record installation: ${err.message}`);
    }
  }
}
