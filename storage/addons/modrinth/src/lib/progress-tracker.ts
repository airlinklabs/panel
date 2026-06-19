// ── Progress Tracker ──
// In-memory singleton tracking active installations.
// Typed, with auto-cleanup and max entries.

import type {
  InstallationProgress,
  ModProgress,
  ProgressStage,
} from '../types/modrinth';

const MAX_TRACKED = 100;
const COMPLETED_TTL_MS = 30_000;
const FAILED_TTL_MS = 60_000;
const STALE_TTL_MS = 30 * 60 * 1000;

interface TrackedEntry {
  progress: InstallationProgress;
  lastUpdated: number;
}

class ProgressTracker {
  private tracked = new Map<string, TrackedEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 10_000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.tracked.entries()) {
      const age = now - entry.lastUpdated;
      const { stage } = entry.progress;

      if (stage === 'completed' && age > COMPLETED_TTL_MS) {
        this.tracked.delete(key);
      } else if (stage === 'failed' && age > FAILED_TTL_MS) {
        this.tracked.delete(key);
      } else if (age > STALE_TTL_MS) {
        this.tracked.delete(key);
      }
    }

    // Evict oldest if over limit
    if (this.tracked.size > MAX_TRACKED) {
      const entries = Array.from(this.tracked.entries())
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
      const toRemove = entries.slice(0, entries.length - MAX_TRACKED);
      for (const [key] of toRemove) {
        this.tracked.delete(key);
      }
    }
  }

  private makeKey(serverId: string, projectId: string): string {
    return `${serverId}:${projectId}`;
  }

  /**
   * Initialize a new installation tracker.
   */
  initialize(
    serverId: string,
    projectId: string,
    projectName: string,
    totalMods: number = 0
  ): InstallationProgress {
    const key = this.makeKey(serverId, projectId);
    const progress: InstallationProgress = {
      serverId,
      projectId,
      projectName,
      stage: 'initializing',
      totalMods,
      completedMods: 0,
      skippedMods: 0,
      failedMods: 0,
      currentMod: '',
      mods: [],
      errors: [],
      warnings: [],
      startedAt: Date.now(),
    };

    this.tracked.set(key, { progress, lastUpdated: Date.now() });
    return progress;
  }

  /**
   * Update the stage of an installation.
   */
  updateStage(
    serverId: string,
    projectId: string,
    stage: ProgressStage,
    currentMod: string = ''
  ): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.stage = stage;
    entry.progress.currentMod = currentMod;
    entry.lastUpdated = Date.now();
  }

  /**
   * Add a mod to the progress tracker.
   */
  addMod(
    serverId: string,
    projectId: string,
    mod: ModProgress
  ): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.mods.push(mod);
    entry.lastUpdated = Date.now();
  }

  /**
   * Update a mod's status in the progress tracker.
   */
  updateMod(
    serverId: string,
    projectId: string,
    modProjectId: string,
    status: ModProgress['status'],
    error?: string
  ): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    const mod = entry.progress.mods.find(m => m.projectId === modProjectId);
    if (mod) {
      mod.status = status;
      if (error) mod.error = error;
    }

    if (status === 'completed') entry.progress.completedMods++;
    else if (status === 'failed') entry.progress.failedMods++;
    else if (status === 'skipped') entry.progress.skippedMods++;

    entry.lastUpdated = Date.now();
  }

  /**
   * Add an error message.
   */
  addError(serverId: string, projectId: string, error: string): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.errors.push(error);
    entry.lastUpdated = Date.now();
  }

  /**
   * Add a warning message.
   */
  addWarning(serverId: string, projectId: string, warning: string): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.warnings.push(warning);
    entry.lastUpdated = Date.now();
  }

  /**
   * Mark an installation as completed.
   */
  complete(serverId: string, projectId: string): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.stage = 'completed';
    entry.progress.completedAt = Date.now();
    entry.lastUpdated = Date.now();
  }

  /**
   * Mark an installation as failed.
   */
  fail(serverId: string, projectId: string, error: string): void {
    const key = this.makeKey(serverId, projectId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.progress.stage = 'failed';
    entry.progress.errors.push(error);
    entry.progress.completedAt = Date.now();
    entry.lastUpdated = Date.now();
  }

  /**
   * Get progress for a specific installation.
   */
  get(serverId: string, projectId: string): InstallationProgress | null {
    const key = this.makeKey(serverId, projectId);
    return this.tracked.get(key)?.progress ?? null;
  }

  /**
   * Get all active installations for a server.
   */
  getForServer(serverId: string): InstallationProgress[] {
    const results: InstallationProgress[] = [];
    for (const entry of this.tracked.values()) {
      if (entry.progress.serverId === serverId) {
        results.push(entry.progress);
      }
    }
    return results;
  }

  /**
   * Get all active installations.
   */
  getAll(): InstallationProgress[] {
    return Array.from(this.tracked.values()).map(e => e.progress);
  }

  /**
   * Remove a progress entry.
   */
  remove(serverId: string, projectId: string): void {
    const key = this.makeKey(serverId, projectId);
    this.tracked.delete(key);
  }

  /**
   * Destroy the tracker (cleanup interval).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.tracked.clear();
  }
}

// Singleton
export const progressTracker = new ProgressTracker();
