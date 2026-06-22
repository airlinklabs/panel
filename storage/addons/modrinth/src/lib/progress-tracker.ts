export interface ModInstallProgress {
  name: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
  error?: string;
  size?: number;
  downloadedSize?: number;
  skipReason?: string;
}

export interface InstallationProgress {
  serverId: string;
  projectId: string;
  projectName: string;
  projectType: string;
  stage: 'initializing' | 'downloading' | 'processing' | 'installing_mods' | 'installing_overrides' | 'finalizing' | 'completed' | 'failed';
  stageMessage: string;
  overallProgress: number;
  totalMods: number;
  completedMods: number;
  failedMods: number;
  skippedMods: number;
  totalOverrides: number;
  completedOverrides: number;
  mods: Map<string, ModInstallProgress>;
  currentMod?: string;
  startTime: number;
  lastUpdate: number;
  error?: string;
  errorDetails?: string;
  warnings: string[];
  criticalErrors: string[];
}

const STAGE_PROGRESS: Record<InstallationProgress['stage'], number> = {
  initializing: 5,
  downloading: 15,
  processing: 25,
  installing_mods: 50,
  installing_overrides: 80,
  finalizing: 95,
  completed: 100,
  failed: 0,
};

class ProgressTracker {
  private installations = new Map<string, InstallationProgress>();
  private readonly MAX_HISTORY = 100;

  private key(serverId: string, projectId: string): string {
    return `${serverId}:${projectId}`;
  }

  initializeInstallation(
    serverId: string,
    projectId: string,
    projectName: string,
    projectType: string,
    totalMods = 0,
    totalOverrides = 0,
  ): void {
    const k = this.key(serverId, projectId);

    // Clean up completed/failed installations for this server
    for (const [existingKey, p] of this.installations.entries()) {
      if (p.serverId === serverId && (p.stage === 'completed' || p.stage === 'failed')) {
        this.installations.delete(existingKey);
      }
    }

    this.installations.set(k, {
      serverId,
      projectId,
      projectName,
      projectType,
      stage: 'initializing',
      stageMessage: 'Preparing installation...',
      overallProgress: 0,
      totalMods,
      completedMods: 0,
      failedMods: 0,
      skippedMods: 0,
      totalOverrides,
      completedOverrides: 0,
      mods: new Map(),
      startTime: Date.now(),
      lastUpdate: Date.now(),
      warnings: [],
      criticalErrors: [],
    });
  }

  updateStage(serverId: string, projectId: string, stage: InstallationProgress['stage'], message: string): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p) return;
    p.stage = stage;
    p.stageMessage = message;
    p.lastUpdate = Date.now();
    const base = stage === 'failed' ? p.overallProgress : STAGE_PROGRESS[stage];
    p.overallProgress = Math.max(p.overallProgress, base);
  }

  registerMod(serverId: string, projectId: string, modName: string, size?: number): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p) return;
    p.mods.set(modName, { name: modName, status: 'pending', size });
  }

  updateModProgress(
    serverId: string,
    projectId: string,
    modName: string,
    status: ModInstallProgress['status'],
    options?: { downloadedSize?: number; error?: string; skipReason?: string },
  ): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p) return;

    let mod = p.mods.get(modName);
    if (!mod) {
      this.registerMod(serverId, projectId, modName);
      mod = p.mods.get(modName)!;
    }

    const prev = mod.status;
    mod.status = status;
    mod.downloadedSize = options?.downloadedSize;
    mod.error = options?.error;
    mod.skipReason = options?.skipReason;
    p.currentMod = status === 'downloading' ? modName : undefined;
    p.lastUpdate = Date.now();

    if (prev !== status) {
      if (status === 'completed') p.completedMods++;
      else if (status === 'failed') {
        p.failedMods++;
        if (options?.error) this.addCriticalError(serverId, projectId, `${modName}: ${options.error}`);
      } else if (status === 'skipped') p.skippedMods++;
    }

    if (p.totalMods > 0) {
      const ratio = (p.completedMods + p.skippedMods) / p.totalMods;
      p.overallProgress = Math.max(p.overallProgress, 25 + ratio * 50);
    }
  }

  updateOverrideProgress(serverId: string, projectId: string, completed: number): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p) return;
    p.completedOverrides = completed;
    p.lastUpdate = Date.now();
    if (p.totalOverrides > 0) {
      const ratio = completed / p.totalOverrides;
      p.overallProgress = Math.max(p.overallProgress, 75 + ratio * 15);
    }
  }

  addWarning(serverId: string, projectId: string, warning: string): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p || p.warnings.length >= 50) return;
    p.warnings.push(warning);
    p.lastUpdate = Date.now();
  }

  addCriticalError(serverId: string, projectId: string, error: string): void {
    const p = this.installations.get(this.key(serverId, projectId));
    if (!p || p.criticalErrors.length >= 20) return;
    p.criticalErrors.push(error);
    p.lastUpdate = Date.now();
  }

  completeInstallation(serverId: string, projectId: string): void {
    const k = this.key(serverId, projectId);
    const p = this.installations.get(k);
    if (!p) return;
    p.stage = 'completed';
    p.stageMessage = 'Installation completed successfully';
    p.overallProgress = 100;
    p.currentMod = undefined;
    p.lastUpdate = Date.now();
    setTimeout(() => this.installations.delete(k), 30000);
  }

  failInstallation(serverId: string, projectId: string, error: string, errorDetails?: string): void {
    const k = this.key(serverId, projectId);
    const p = this.installations.get(k);
    if (!p) return;
    p.stage = 'failed';
    p.stageMessage = 'Installation failed';
    p.error = error;
    p.errorDetails = errorDetails;
    p.currentMod = undefined;
    p.lastUpdate = Date.now();
    this.addCriticalError(serverId, projectId, error);
    setTimeout(() => this.installations.delete(k), 60000);
  }

  getProgress(serverId: string, projectId: string): InstallationProgress | null {
    return this.installations.get(this.key(serverId, projectId)) || null;
  }

  getAllProgress(): InstallationProgress[] {
    return Array.from(this.installations.values());
  }

  clearProgress(serverId: string, projectId: string): void {
    this.installations.delete(this.key(serverId, projectId));
  }

  cleanup(): void {
    const now = Date.now();
    for (const [k, p] of this.installations.entries()) {
      if ((p.stage === 'completed' || p.stage === 'failed') && now - p.lastUpdate > 30_000) {
        this.installations.delete(k);
        continue;
      }
      if (p.stage !== 'completed' && p.stage !== 'failed' && now - p.lastUpdate > 30 * 60_000) {
        this.installations.delete(k);
      }
    }
    if (this.installations.size > this.MAX_HISTORY) {
      const sorted = Array.from(this.installations.entries()).sort((a, b) => b[1].lastUpdate - a[1].lastUpdate);
      this.installations.clear();
      sorted.slice(0, this.MAX_HISTORY).forEach(([k, v]) => this.installations.set(k, v));
    }
  }

  serializeProgress(p: InstallationProgress): object {
    return {
      serverId: p.serverId,
      projectId: p.projectId,
      projectName: p.projectName,
      projectType: p.projectType,
      stage: p.stage,
      stageMessage: p.stageMessage,
      overallProgress: Math.round(p.overallProgress),
      totalMods: p.totalMods,
      completedMods: p.completedMods,
      failedMods: p.failedMods,
      skippedMods: p.skippedMods,
      totalOverrides: p.totalOverrides,
      completedOverrides: p.completedOverrides,
      currentMod: p.currentMod,
      mods: Array.from(p.mods.values()),
      elapsedTime: Date.now() - p.startTime,
      error: p.error,
      errorDetails: p.errorDetails,
      warnings: p.warnings,
      criticalErrors: p.criticalErrors,
    };
  }
}

export const progressTracker = new ProgressTracker();

// Auto-cleanup every 60 seconds
setInterval(() => progressTracker.cleanup(), 60_000);
