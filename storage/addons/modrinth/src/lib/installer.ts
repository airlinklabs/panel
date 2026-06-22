import path from 'path';
import AdmZip from 'adm-zip';
import { DaemonClient } from './daemon-client';
import { ModpackIndex } from '../types/modrinth-api';
import { progressTracker } from './progress-tracker';

const CLIENT_MOD_PATTERNS = [
  'optifine', 'sodium', 'iris', 'continuity', 'rei', 'jei',
  'journey-map', 'journeymap', 'xaero', 'voxelmap', 'jade',
];

export class Installer {
  private daemon: DaemonClient;

  constructor(private prisma: any, private logger: any, daemon: DaemonClient) {
    this.daemon = daemon;
  }

  parseMrpackIndex(indexBuffer: Buffer): ModpackIndex {
    try {
      if (!indexBuffer?.length) throw new Error('Empty index buffer');
      const parsed = JSON.parse(indexBuffer.toString('utf8'));
      if (!parsed.formatVersion || !parsed.game || !parsed.name || !parsed.dependencies) {
        throw new Error('Invalid modpack index: missing required fields');
      }
      return { ...parsed, files: Array.isArray(parsed.files) ? parsed.files : [] };
    } catch (error: any) {
      this.logger?.error('Failed to parse modpack index:', error.message);
      throw new Error(`Failed to parse modpack index.json: ${error.message}`);
    }
  }

  private shouldSkipFile(fileInfo: any): { skip: boolean; reason: string } {
    if (fileInfo.env?.server === 'unsupported') return { skip: true, reason: 'client-only' };
    if (fileInfo.env?.server === 'optional' && fileInfo.env?.client === 'required') {
      const filename = fileInfo.path?.toLowerCase() || '';
      if (CLIENT_MOD_PATTERNS.some((mod) => filename.includes(mod))) {
        return { skip: true, reason: 'client-side enhancement' };
      }
    }
    return { skip: false, reason: '' };
  }

  private getFileDestination(filename: string, projectType: string, fileInfo?: any): string {
    const ext = path.extname(filename).toLowerCase();
    const name = path.basename(filename).toLowerCase();

    const typeMap: Record<string, string> = {
      mod: 'mods', plugin: 'plugins', resourcepack: 'resourcepacks',
      'resource-pack': 'resourcepacks', datapack: 'world/datapacks',
      'data-pack': 'world/datapacks', shader: 'shaderpacks',
      shaderpack: 'shaderpacks', modpack: '/',
    };

    const destination = typeMap[projectType.toLowerCase()];
    if (destination) return destination;

    if (ext === '.jar') {
      const modPatterns = ['fabric', 'forge', 'quilt', 'neoforge', 'mod', 'loader'];
      const pluginPatterns = ['plugin', 'bukkit', 'spigot', 'paper'];
      if (modPatterns.some((p) => name.includes(p))) return 'mods';
      if (pluginPatterns.some((p) => name.includes(p))) return 'plugins';
      if (!name.includes('server') && !name.includes('vanilla')) return 'mods';
    }

    if (ext === '.zip') {
      if (name.includes('resource') || name.includes('texture')) return 'resourcepacks';
      if (name.includes('shader') || name.includes('optifine')) return 'shaderpacks';
      if (name.includes('datapack')) return 'world/datapacks';
    }

    if (fileInfo?.path) {
      const filePath = fileInfo.path.toLowerCase();
      const pathChecks: [string, string][] = [
        ['mods/', 'mods'], ['plugins/', 'plugins'], ['resourcepacks/', 'resourcepacks'],
        ['shaderpacks/', 'shaderpacks'], ['datapacks/', 'world/datapacks'],
      ];
      for (const [prefix, dest] of pathChecks) {
        if (filePath.startsWith(prefix)) return dest;
      }
    }

    return '/';
  }

  private isModpack(projectType: string, filename: string): boolean {
    return projectType.toLowerCase() === 'modpack' || filename.endsWith('.mrpack') ||
      (filename.endsWith('.zip') && projectType.toLowerCase() === 'modpack');
  }

  async installModpack(
    serverId: string,
    projectId: string,
    versionId: string,
    modrinthClient: any,
  ): Promise<void> {
    let installationCreated = false;

    try {
      progressTracker.updateStage(serverId, projectId, 'initializing', 'Fetching project information...');

      const [project, version] = await Promise.all([
        modrinthClient.getProject(projectId),
        modrinthClient.getVersion(versionId),
      ]);

      const primaryFile = version.files.find((f: any) => f.primary) || version.files[0];
      if (!primaryFile) throw new Error('No files found in version');

      await this.createInstallationRecord(serverId, projectId, versionId, project.title, project.project_type, primaryFile.filename);
      installationCreated = true;

      const server = await this.prisma.server.findUnique({
        where: { UUID: serverId },
        include: { node: true },
      });
      if (!server) throw new Error('Server not found in database');

      progressTracker.updateStage(serverId, projectId, 'initializing', 'Checking server status...');
      const serverStatus = await this.daemon.getServerStatus({
        nodeAddress: server.node.address,
        nodePort: server.node.port,
        serverUUID: server.UUID,
        nodeKey: server.node.key,
      });
      if (serverStatus.daemonOffline) throw new Error('Server daemon is offline - cannot install files');

      progressTracker.updateStage(serverId, projectId, 'downloading', `Downloading ${primaryFile.filename}...`);

      if (this.isModpack(project.project_type, primaryFile.filename)) {
        const mcVersion = version.game_versions?.[0];
        const loader = version.loaders?.[0];
        if (mcVersion && loader) {
          try {
            progressTracker.updateStage(serverId, projectId, 'downloading', 'Installing server JAR...');
            const serverJarInfo = await this.daemon.getServerJarInfo(mcVersion, loader);
            if (serverJarInfo) {
              const serverJarBuffer = await this.daemon.downloadServerJar(serverJarInfo);
              await this.daemon.uploadFileToServer(server, '/', 'server.jar', serverJarBuffer);
            }
          } catch (error: any) {
            this.logger?.error('Server JAR install failed:', error.message);
            progressTracker.addWarning(serverId, projectId, `Server JAR install failed: ${error.message}`);
          }
        }
      }

      const fileBuffer = await this.daemon.downloadFile(primaryFile.url, primaryFile.filename);
      progressTracker.updateStage(serverId, projectId, 'processing', `Processing ${primaryFile.filename}...`);

      if (primaryFile.filename.endsWith('.mrpack')) {
        await this.installMrpack(server, fileBuffer, serverId, projectId, project.title);
      } else if (this.isModpack(project.project_type, primaryFile.filename) && primaryFile.filename.endsWith('.zip')) {
        await this.installZipFile(server, fileBuffer, serverId, projectId, project.title);
      } else {
        const destination = this.getFileDestination(primaryFile.filename, project.project_type);
        await this.installSingleFile(server, primaryFile.filename, fileBuffer, destination, serverId, projectId);
      }

      progressTracker.completeInstallation(serverId, projectId);
      await this.updateInstallationStatus(serverId, versionId, 'completed');

      try {
        await this.daemon.createDirectory(server, 'airlink');
        await this.daemon.uploadFileToServer(server, 'airlink', 'installed.txt', Buffer.from('Installed: true'));
      } catch {
        // Non-critical
      }
    } catch (error: any) {
      this.logger?.error('Modpack installation failed:', { projectId, serverId, error: error.message });
      progressTracker.failInstallation(serverId, projectId, error.message, error.stack);
      if (installationCreated) {
        await this.updateInstallationStatus(serverId, versionId, 'failed', error.message);
      }
      throw error;
    }
  }

  async installMrpack(
    server: any,
    mrpackBuffer: Buffer,
    serverId?: string,
    projectId?: string,
    projectName?: string,
  ): Promise<void> {
    const actualServerId = serverId || server.UUID;
    const actualProjectId = projectId || 'mrpack-upload';
    const actualProjectName = projectName || 'Uploaded Modpack';

    let zip: AdmZip;
    try {
      zip = new AdmZip(mrpackBuffer);
    } catch (error: any) {
      this.logger?.error('Invalid .mrpack file:', error.message);
      progressTracker.addCriticalError(actualServerId, actualProjectId, `Invalid .mrpack file: ${error.message}`);
      throw new Error(`Invalid .mrpack file: ${error.message}`);
    }

    const indexEntry = zip.getEntry('modrinth.index.json');
    if (!indexEntry) throw new Error('Missing modrinth.index.json in .mrpack file');

    const indexBuffer = indexEntry.getData();
    if (!indexBuffer?.length) throw new Error('Empty modrinth.index.json');

    const index = this.parseMrpackIndex(indexBuffer);
    const loader = Object.keys(index.dependencies).find(
      (key) => key !== 'minecraft' && ['forge', 'fabric', 'quilt', 'neoforge'].includes(key.toLowerCase()),
    ) || 'vanilla';

    const overridesEntries = zip.getEntries().filter(
      (entry) => entry.entryName.startsWith('overrides/') && !entry.isDirectory,
    );

    progressTracker.initializeInstallation(actualServerId, actualProjectId, actualProjectName, 'modpack', index.files.length, overridesEntries.length);

    progressTracker.updateStage(actualServerId, actualProjectId, 'processing', 'Cleaning up existing mods...');
    try {
      await this.daemon.cleanupServerDirectory(server, '/mods');
    } catch (error: any) {
      progressTracker.addWarning(actualServerId, actualProjectId, `Cleanup failed: ${error.message}`);
    }

    progressTracker.updateStage(actualServerId, actualProjectId, 'installing_overrides', `Installing ${overridesEntries.length} override files...`);
    let completedOverrides = 0;
    for (const entry of overridesEntries) {
      try {
        const relativePath = entry.entryName.replace('overrides/', '');
        const sanitizedPath = this.daemon.sanitizeFilePath(relativePath);
        if (!sanitizedPath) continue;
        const entryBuffer = entry.getData();
        if (!entryBuffer?.length || !Buffer.isBuffer(entryBuffer)) continue;
        const overrideDir = path.dirname(sanitizedPath);
        if (overrideDir && overrideDir !== '.') {
          await this.createDirectoryIfNeeded(server, overrideDir);
        }
        await this.daemon.uploadFileToServer(server, path.dirname(sanitizedPath) || '/', path.basename(sanitizedPath), entryBuffer);
        completedOverrides++;
        progressTracker.updateOverrideProgress(actualServerId, actualProjectId, completedOverrides);
      } catch (error: any) {
        progressTracker.addWarning(actualServerId, actualProjectId, `Override error ${entry.entryName}: ${error.message}`);
      }
    }

    await this.createDirectoryIfNeeded(server, 'mods');
    for (const fileInfo of index.files) {
      const modName = path.basename(fileInfo.path);
      progressTracker.registerMod(actualServerId, actualProjectId, modName, fileInfo.fileSize);
    }

    progressTracker.updateStage(actualServerId, actualProjectId, 'installing_mods', `Installing ${index.files.length} mods...`);
    const batchSize = 3;
    for (let i = 0; i < index.files.length; i += batchSize) {
      const batch = index.files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (fileInfo) => {
        const modName = path.basename(fileInfo.path);
        try {
          const skipCheck = this.shouldSkipFile(fileInfo);
          if (skipCheck.skip) {
            progressTracker.updateModProgress(actualServerId, actualProjectId, modName, 'skipped', { skipReason: skipCheck.reason });
            return { status: 'skipped' };
          }
          if (!fileInfo.path || !fileInfo.downloads?.length) {
            progressTracker.updateModProgress(actualServerId, actualProjectId, modName, 'failed', { error: 'Invalid file info' });
            return { status: 'failed' };
          }
          const modBuffer = await this.daemon.downloadFile(fileInfo.downloads[0], modName, fileInfo.hashes?.sha1);
          if (!Buffer.isBuffer(modBuffer) || !modBuffer.length) throw new Error('Invalid mod buffer');
          const destination = this.getFileDestination(modName, 'mod', fileInfo);
          const finalPath = fileInfo.path.includes('/') ? fileInfo.path : `${destination}/${modName}`;
          const sanitizedPath = this.daemon.sanitizeFilePath(finalPath);
          if (!sanitizedPath) throw new Error('Invalid sanitized path');
          const success = await this.daemon.uploadFileToServer(server, path.dirname(sanitizedPath) || '/mods', path.basename(sanitizedPath), modBuffer);
          if (!success) throw new Error('Upload failed');
          return { status: 'success' };
        } catch (error: any) {
          progressTracker.updateModProgress(actualServerId, actualProjectId, modName, 'failed', { error: error.message });
          return { status: 'failed' };
        }
      });
      await Promise.allSettled(batchPromises);
      if (i + batchSize < index.files.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    progressTracker.updateStage(actualServerId, actualProjectId, 'finalizing', 'Finalizing installation...');
    const progress = progressTracker.getProgress(actualServerId, actualProjectId);
    if (progress && progress.completedMods === 0 && progress.failedMods === progress.totalMods) {
      throw new Error('No mod files were successfully processed');
    }
  }

  async installZipFile(
    server: any,
    zipBuffer: Buffer,
    serverId?: string,
    projectId?: string,
    projectName?: string,
  ): Promise<void> {
    const actualServerId = serverId || server.UUID;
    const actualProjectId = projectId || 'zip-upload';
    const actualProjectName = projectName || 'Uploaded ZIP';

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (error: any) {
      this.logger?.error('Invalid ZIP file:', error.message);
      progressTracker.addCriticalError(actualServerId, actualProjectId, `Invalid ZIP file: ${error.message}`);
      throw new Error(`Invalid ZIP file: ${error.message}`);
    }

    const entries = zip.getEntries();
    progressTracker.initializeInstallation(actualServerId, actualProjectId, actualProjectName, 'modpack', 0, entries.length);
    progressTracker.updateStage(actualServerId, actualProjectId, 'processing', `Processing ${entries.length} files from ZIP...`);

    try {
      await this.daemon.cleanupServerDirectory(server, '/mods');
    } catch (error: any) {
      progressTracker.addWarning(actualServerId, actualProjectId, `Cleanup failed: ${error.message}`);
    }

    let completedCount = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      try {
        const entryBuffer = entry.getData();
        if (!entryBuffer?.length) { progressTracker.addWarning(actualServerId, actualProjectId, `Empty file: ${entry.entryName}`); continue; }
        const sanitizedPath = this.daemon.sanitizeFilePath(entry.entryName);
        if (!sanitizedPath) { progressTracker.addWarning(actualServerId, actualProjectId, `Invalid path: ${entry.entryName}`); continue; }
        const entryDir = path.dirname(sanitizedPath);
        if (entryDir && entryDir !== '.' && entryDir !== '/') {
          await this.createDirectoryIfNeeded(server, entryDir);
        }
        const success = await this.daemon.uploadFileToServer(server, path.dirname(sanitizedPath) || '/', path.basename(sanitizedPath), entryBuffer);
        if (success) {
          completedCount++;
          progressTracker.updateOverrideProgress(actualServerId, actualProjectId, completedCount);
        }
      } catch (error: any) {
        progressTracker.addWarning(actualServerId, actualProjectId, `File error ${entry.entryName}: ${error.message}`);
      }
    }

    progressTracker.updateStage(actualServerId, actualProjectId, 'finalizing', 'Finalizing installation...');
  }

  private async createDirectoryIfNeeded(server: any, destinationDir: string): Promise<void> {
    if (destinationDir === '/') return;
    try {
      if (destinationDir === 'mods') {
        await this.daemon.createModsDirectory(server);
      } else if (destinationDir === 'world/datapacks') {
        await this.daemon.createDirectory(server, 'world');
        await this.daemon.createDirectory(server, 'world/datapacks');
      } else {
        await this.daemon.createDirectory(server, destinationDir);
      }
    } catch (error: any) {
      this.logger?.warn(`Failed to create directory ${destinationDir}:`, error.message);
    }
  }

  private async installSingleFile(
    server: any,
    filename: string,
    fileBuffer: Buffer,
    destinationDir: string,
    serverId?: string,
    projectId?: string,
  ): Promise<void> {
    await this.createDirectoryIfNeeded(server, destinationDir);
    if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
      const error = `Invalid buffer for: ${filename}`;
      if (serverId && projectId) progressTracker.addCriticalError(serverId, projectId, error);
      throw new Error(error);
    }
    const success = await this.daemon.uploadFileToServer(server, destinationDir, filename, fileBuffer);
    if (!success) {
      const error = `Upload failed: ${filename}`;
      if (serverId && projectId) progressTracker.addCriticalError(serverId, projectId, error);
      throw new Error(error);
    }
  }

  private async updateInstallationStatus(
    serverId: string,
    versionId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE ModrinthInstallation
        SET status = ${status}, error = ${error || null}
        WHERE serverId = ${serverId} AND versionId = ${versionId}
      `;
    } catch {
      // Silent fail
    }
  }

  private async createInstallationRecord(
    serverId: string,
    projectId: string,
    versionId: string,
    projectName: string,
    projectType: string,
    fileName: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ModrinthInstallation
          (serverId, projectId, versionId, projectName, projectType, status)
        VALUES
          (${serverId}, ${projectId}, ${versionId}, ${projectName}, ${projectType}, 'in_progress')
      `;
    } catch (error: any) {
      this.logger?.error('Failed to create installation record:', error.message);
      throw new Error('Failed to create installation record');
    }
  }
}
