import type { InstallProgress, InstallStage, ModProgress } from './types';

const TRACKED = new Map<string, InstallProgress>();
const MAX_TRACKED = 100;

export class ProgressTracker {
  start(serverId: string, projectId: string, projectName: string): InstallProgress {
    const key = `${serverId}:${projectId}`;
    if (TRACKED.size >= MAX_TRACKED) this.evictOldest();

    const progress: InstallProgress = {
      serverId,
      projectId,
      projectName,
      stage: 'initializing',
      overall: 0,
      total: 0,
      done: 0,
      skipped: 0,
      failed: 0,
      currentMod: '',
      mods: [],
      errors: [],
      warnings: [],
      startedAt: Date.now(),
    };
    TRACKED.set(key, progress);
    return progress;
  }

  get(serverId: string, projectId: string): InstallProgress | undefined {
    return TRACKED.get(`${serverId}:${projectId}`);
  }

  getAll(): InstallProgress[] {
    return Array.from(TRACKED.values());
  }

  updateStage(key: string, stage: InstallStage, overall?: number): void {
    const p = TRACKED.get(key);
    if (!p) return;
    p.stage = stage;
    if (overall !== undefined) p.overall = overall;
  }

  setMods(key: string, mods: ModProgress[]): void {
    const p = TRACKED.get(key);
    if (!p) return;
    p.mods = mods;
    p.total = mods.length;
    p.done = mods.filter(m => m.status === 'completed').length;
    p.skipped = mods.filter(m => m.status === 'skipped').length;
    p.failed = mods.filter(m => m.status === 'failed').length;
    p.overall = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  }

  setCurrentMod(key: string, mod: string): void {
    const p = TRACKED.get(key);
    if (p) p.currentMod = mod;
  }

  addError(key: string, error: string): void {
    const p = TRACKED.get(key);
    if (p) {
      p.errors.push(error);
      if (p.errors.length > 50) p.errors.shift();
    }
  }

  addWarning(key: string, warning: string): void {
    const p = TRACKED.get(key);
    if (p) {
      p.warnings.push(warning);
      if (p.warnings.length > 20) p.warnings.shift();
    }
  }

  complete(key: string): void {
    const p = TRACKED.get(key);
    if (!p) return;
    p.stage = p.errors.length > 0 ? 'failed' : 'completed';
    p.overall = 100;
    setTimeout(() => TRACKED.delete(key), 30_000);
  }

  fail(key: string, error: string): void {
    const p = TRACKED.get(key);
    if (!p) return;
    p.stage = 'failed';
    p.errors.push(error);
    setTimeout(() => TRACKED.delete(key), 60_000);
  }

  remove(key: string): void {
    TRACKED.delete(key);
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, p] of TRACKED) {
      if (p.stage === 'completed' || p.stage === 'failed') {
        if (p.startedAt < oldestTime) {
          oldestTime = p.startedAt;
          oldest = key;
        }
      }
    }
    if (oldest) TRACKED.delete(oldest);
    else {
      const first = TRACKED.keys().next().value;
      if (first) TRACKED.delete(first);
    }
  }
}

export const progressTracker = new ProgressTracker();
