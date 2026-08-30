import { randomUUID } from 'node:crypto';

/**
 * jobRegistry — in-memory tracker for long-running panel jobs.
 *
 * Some blocking operations (notably backup creation) are started by one page
 * but a user may navigate away before they finish. This registry records the
 * job so the client toasts that drive it can keep polling a small progress
 * endpoint on any page and resolve cleanly (success or failure) once the
 * operation settles.
 *
 * The data is intentionally process-local and non-sensitive: no user
 * content is stored, only status for the current process. A restart simply
 * forgets the jobs, which is acceptable for an at-a-glance progress layer.
 */

export type JobKind = 'backup' | 'restore';

export interface ProgressJob {
  id: string;
  kind: JobKind;
  /** Dedupe key (e.g. the server UUID a backup belongs to). */
  key: string;
  startedAt: number;
  updatedAt: number;
  status: 'running' | 'done';
  success?: boolean;
  error?: string;
  message: string;
}

export interface JobProgressView {
  id: string;
  kind: JobKind;
  running: boolean;
  progress: number;
  message: string;
  done: boolean;
  success?: boolean;
  error?: string;
}

/** How long a job may stay in the registry after its last update. */
const TTL_MS = 30 * 60 * 1000;
/** Progress is estimated while running; does not exceed 95 until finish. */
const MAX_RUNNING_PROGRESS = 95;

const jobs = new Map<string, ProgressJob>();

function now(): number {
  return Date.now();
}

function prune(): void {
  const cutoff = now() - TTL_MS;
  for (const [key, job] of jobs) {
    if (job.updatedAt < cutoff) {
      jobs.delete(key);
    }
  }
}

export function startJob(
  kind: JobKind,
  key: string,
  message: string,
  jobId?: string,
): ProgressJob {
  prune();
  const existing = getJob(kind, key);
  if (existing) {
    return existing;
  }
  const job: ProgressJob = {
    id: jobId ?? randomUUID(),
    kind,
    key,
    startedAt: now(),
    updatedAt: now(),
    status: 'running',
    message,
  };
  jobs.set(key, job);
  return job;
}

export function getJob(kind: JobKind, key: string): ProgressJob | undefined {
  prune();
  const job = jobs.get(key);
  return job && job.kind === kind ? job : undefined;
}

export function isRunning(kind: JobKind, key: string): boolean {
  const job = getJob(kind, key);
  return job !== undefined && job.status === 'running';
}

export function finishJob(
  kind: JobKind,
  key: string,
  success: boolean,
  error?: string,
  message?: string,
): void {
  const job = getJob(kind, key);
  if (!job) {
    return;
  }
  job.status = 'done';
  job.success = success;
  job.error = error;
  job.message =
    message ?? (success ? 'Task completed.' : (error ?? 'Task failed.'));
  job.updatedAt = now();
}

export function clearJob(kind: JobKind, key: string): void {
  const job = getJob(kind, key);
  if (job) {
    jobs.delete(key);
  }
}

/**
 * Builds the JSON payload served by progress endpoints. While running the
 * percentage is an elapsed-based (0–95) estimate because the daemon does not
 * stream backup progress; the real Success/failure is reported the moment the
 * blocking operation returns.
 */
export function describeJob(job: ProgressJob | undefined): JobProgressView {
  if (!job) {
    return {
      id: '',
      kind: 'backup',
      running: false,
      progress: 0,
      message: 'No task is running.',
      done: false,
      success: undefined,
      error: undefined,
    };
  }
  if (job.status === 'done') {
    return {
      id: job.id,
      kind: job.kind,
      running: false,
      progress: 100,
      message: job.message,
      done: true,
      success: job.success,
      error: job.success ? undefined : job.error,
    };
  }
  const elapsed = now() - job.startedAt;
  const climb = Math.min(MAX_RUNNING_PROGRESS, Math.round(elapsed / 600) * 5);
  return {
    id: job.id,
    kind: job.kind,
    running: true,
    progress: climb,
    message: job.message,
    done: false,
  };
}

export function listJobs(): ProgressJob[] {
  prune();
  return Array.from(jobs.values());
}
