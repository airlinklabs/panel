import { describe, it, expect } from 'vitest';
import {
  startJob,
  getJob,
  isRunning,
  finishJob,
  clearJob,
  describeJob,
  listJobs,
} from '../src/handlers/jobRegistry';

describe('jobRegistry', () => {
  it('starts a running job and reports it as such', () => {
    const job = startJob('backup', 'server-1', 'Creating backup…');
    expect(job.status).toBe('running');
    expect(isRunning('backup', 'server-1')).toBe(true);
    expect(getJob('backup', 'server-1')?.id).toBe(job.id);
  });

  it('does not double-start the same job', () => {
    startJob('backup', 'server-1', 'Creating backup…');
    const second = startJob('backup', 'server-1', 'Second attempt');
    expect(second.id).toBeTruthy();
    expect(listJobs()).toHaveLength(1);
  });

  it('describes a running job with estimated progress below 100', () => {
    const job = startJob('backup', 'server-2', 'Creating backup…');
    const view = describeJob(getJob('backup', 'server-2'));
    expect(view.running).toBe(true);
    expect(view.done).toBe(false);
    expect(view.progress).toBeGreaterThanOrEqual(0);
    expect(view.progress).toBeLessThan(100);
    expect(view.id).toBe(job.id);
  });

  it('finishes a job successfully', () => {
    startJob('backup', 'server-3', 'Creating backup…');
    finishJob('backup', 'server-3', true, undefined, 'Backup created.');
    const view = describeJob(getJob('backup', 'server-3'));
    expect(view.done).toBe(true);
    expect(view.success).toBe(true);
    expect(view.progress).toBe(100);
    expect(view.message).toBe('Backup created.');
    expect(isRunning('backup', 'server-3')).toBe(false);
  });

  it('finishes a job as failed without leaking the raw error', () => {
    startJob('backup', 'server-4', 'Creating backup…');
    finishJob('backup', 'server-4', false, 'Backup creation failed.', 'Backup creation failed.');
    const view = describeJob(getJob('backup', 'server-4'));
    expect(view.done).toBe(true);
    expect(view.success).toBe(false);
    expect(view.error).toBe('Backup creation failed.');
    expect(view.message).toBe('Backup creation failed.');
  });

  it('tracks restore jobs under their own kind', () => {
    startJob('restore', 'server-5', 'Restoring backup…');
    expect(isRunning('backup', 'server-5')).toBe(false);
    expect(isRunning('restore', 'server-5')).toBe(true);
    const view = describeJob(getJob('restore', 'server-5'));
    expect(view.kind).toBe('restore');
    expect(view.running).toBe(true);
    finishJob('restore', 'server-5', true, undefined, 'Backup restored.');
    expect(describeJob(getJob('restore', 'server-5')).done).toBe(true);
  });

  it('returns a non-running view for an unknown job', () => {
    const view = describeJob(getJob('backup', 'does-not-exist'));
    expect(view.running).toBe(false);
    expect(view.done).toBe(false);
    expect(view.success).toBeUndefined();
  });

  it('clears a job from the registry', () => {
    startJob('backup', 'server-5', 'Creating backup…');
    clearJob('backup', 'server-5');
    expect(getJob('backup', 'server-5')).toBeUndefined();
  });

  it('scopes jobs to their kind + key', () => {
    startJob('backup', 'server-6', 'Creating backup…');
    expect(getJob('backup', 'server-7')).toBeUndefined();
  });
});