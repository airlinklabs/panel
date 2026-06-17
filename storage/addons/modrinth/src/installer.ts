import AdmZip from 'adm-zip';
import type { ModrinthProject, ModrinthVersion, ServerData, InstallProgress, ModProgress } from './types';
import { ModrinthApiClient } from './modrinth-api';
import { progressTracker } from './progress';
import * as daemon from './daemon';

interface InstallerDeps {
  api: ModrinthApiClient;
  prisma: any;
  logger: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
}

interface InstallOptions {
  server: ServerData;
  project: ModrinthProject;
  version: ModrinthVersion;
}

export async function install(deps: InstallerDeps, opts: InstallOptions): Promise<void> {
  const { api, prisma, logger } = deps;
  const { server, project, version } = opts;
  const key = `${server.UUID}:${project.id}`;

  const progress = progressTracker.start(server.UUID, project.id, project.title);
  progressTracker.updateStage(key, 'initializing', 0);

  const serverInfo = daemon.getServerInfo(server);
  if (!serverInfo) {
    progressTracker.fail(key, 'Could not determine server connection info');
    return;
  }

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ModrinthInstallation (projectId, projectType, projectName, versionId, serverId, status)
       VALUES (?, ?, ?, ?, ?, 'in_progress')`,
      project.id, project.project_type, project.title, version.id, server.UUID
    );
  } catch {
    // table might not exist
  }

  try {
    progressTracker.updateStage(key, 'downloading', 10);

    const primaryFile = version.files.find(f => f.primary) || version.files[0];
    if (!primaryFile) throw new Error('No files in version');

    logger.info(`[Modrinth] Downloading ${primaryFile.filename} from ${primaryFile.url}`);

    const fileRes = await fetch(primaryFile.url, {
      headers: { 'User-Agent': 'AirLink-ModrinthAddon/2.0' },
    });
    if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    progressTracker.updateStage(key, 'processing', 30);

    if (project.project_type === 'modpack') {
      await installModpack(deps, server, serverInfo, buffer, progress, key);
    } else {
      await installSingleFile(deps, server, serverInfo, project, buffer, primaryFile.filename, key);
    }

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE ModrinthInstallation SET status = 'completed' WHERE projectId = ? AND serverId = ? AND status = 'in_progress'`,
        project.id, server.UUID
      );
    } catch { /* best-effort */ }

    progressTracker.complete(key);
    logger.info(`[Modrinth] Installed ${project.title} v${version.version_number} on ${server.name}`);
  } catch (err: any) {
    logger.error(`[Modrinth] Install failed for ${project.title}:`, err.message);
    progressTracker.fail(key, err.message);

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE ModrinthInstallation SET status = 'failed', error = ? WHERE projectId = ? AND serverId = ? AND status = 'in_progress'`,
        err.message, project.id, server.UUID
      );
    } catch { /* best-effort */ }
  }
}

async function installModpack(
  deps: InstallerDeps,
  server: ServerData,
  serverInfo: any,
  buffer: Buffer,
  progress: InstallProgress,
  key: string
): Promise<void> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const indexEntry = entries.find(e => e.entryName === 'modrinth.index.json');
  if (!indexEntry) throw new Error('Invalid modpack: missing modrinth.index.json');

  const index = JSON.parse(indexEntry.getData().toString('utf-8'));
  const overridesDir = index.overrides || 'overrides';

  progressTracker.updateStage(key, 'installing_overrides', 40);

  const overrideEntries = entries.filter(e =>
    e.entryName.startsWith(overridesDir + '/') && !e.isDirectory
  );

  for (const entry of overrideEntries) {
    const relativePath = entry.entryName.slice(overridesDir.length + 1);
    const content = entry.getData();
    try {
      await daemon.uploadFile(serverInfo, server.UUID, relativePath, content);
    } catch (err: any) {
      progressTracker.addWarning(key, `Failed to upload ${relativePath}: ${err.message}`);
    }
  }

  progressTracker.updateStage(key, 'installing_mods', 50);

  const downloads = index.downloads || [];
  const modEntries: { name: string; url: string }[] = [];

  for (const dl of downloads) {
    if (dl.url) modEntries.push({ name: dl.file_name || dl.project_id || 'unknown', url: dl.url });
  }

  if (modEntries.length === 0) {
    progressTracker.updateStage(key, 'finalizing', 95);
    return;
  }

  const mods: { name: string; status: ModProgress['status'] }[] = modEntries.map(m => ({ name: m.name, status: 'pending' }));
  progressTracker.setMods(key, mods as ModProgress[]);

  const CONCURRENCY = 5;
  let idx = 0;

  async function downloadNext(): Promise<void> {
    while (idx < modEntries.length) {
      const i = idx++;
      const mod = modEntries[i];
      const modKey = `${key}:mod:${i}`;

      progressTracker.setCurrentMod(key, mod.name);
      mods[i].status = 'downloading';
      progressTracker.setMods(key, mods);

      try {
        const res = await fetch(mod.url, {
          headers: { 'User-Agent': 'AirLink-ModrinthAddon/2.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const fileBuffer = Buffer.from(await res.arrayBuffer());
        const destDir = daemon.getDestinationDir('mod', mod.name);
        await daemon.uploadFile(serverInfo, server.UUID, `${destDir}/${mod.name}`, fileBuffer);

        mods[i].status = 'completed';
      } catch (err: any) {
        mods[i].status = 'failed';
        progressTracker.addError(key, `Failed to install ${mod.name}: ${err.message}`);
      }

      progressTracker.setMods(key, mods);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, modEntries.length) }, () => downloadNext());
  await Promise.all(workers);

  progressTracker.updateStage(key, 'finalizing', 95);
}

async function installSingleFile(
  deps: InstallerDeps,
  server: ServerData,
  serverInfo: any,
  project: ModrinthProject,
  buffer: Buffer,
  fileName: string,
  key: string
): Promise<void> {
  const destDir = daemon.getDestinationDir(project.project_type, fileName);
  await daemon.uploadFile(serverInfo, server.UUID, `${destDir}/${fileName}`, buffer);
  progressTracker.updateStage(key, 'finalizing', 90);
}
