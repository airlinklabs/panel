import { describe, it, expect } from 'vitest';
import toastLogic from '../public/javascript/shared/toast-logic.js';

const { interpretJob, createRecord, colorMap, uid } = toastLogic;

describe('toast-logic', () => {
  describe('uid', () => {
    it('returns a string', () => {
      expect(typeof uid()).toBe('string');
    });
    it('returns unique values', () => {
      const ids = new Set(Array.from({ length: 100 }, () => uid()));
      expect(ids.size).toBe(100);
    });
  });

  describe('colorMap', () => {
    it('has entries for all toast types', () => {
      expect(colorMap.error).toBeDefined();
      expect(colorMap.success).toBeDefined();
      expect(colorMap.warning).toBeDefined();
      expect(colorMap.loading).toBeDefined();
      expect(colorMap.info).toBeDefined();
    });
  });

  describe('interpretJob', () => {
    it('returns empty object for null/undefined', () => {
      expect(interpretJob(null)).toEqual({});
      expect(interpretJob(undefined)).toEqual({});
    });

    it('returns empty object for non-object input', () => {
      expect(interpretJob('string')).toEqual({});
      expect(interpretJob(42)).toEqual({});
    });

    it('handles installed state', () => {
      const result = interpretJob({ state: 'installed' });
      expect(result.done).toBe(true);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Installation complete.');
    });

    it('handles failed state', () => {
      const result = interpretJob({ state: 'failed', error: 'Disk full' });
      expect(result.done).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });

    it('handles failed state without error message', () => {
      const result = interpretJob({ state: 'failed' });
      expect(result.done).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Installation failed.');
    });

    it('handles unknown state', () => {
      const result = interpretJob({ state: 'installing' });
      expect(result.done).toBeFalsy();
      expect(result.progress).toBeNull();
    });

    it('handles unknown state with error string', () => {
      const result = interpretJob({ state: 'installing', error: 'Compiling...' });
      expect(result.message).toBe('Compiling...');
    });

    it('handles progress payload', () => {
      const result = interpretJob({ progress: 42, message: 'Downloading...' });
      expect(result.progress).toBe(42);
      expect(result.message).toBe('Downloading...');
      expect(result.done).toBeFalsy();
    });

    it('handles done via success field', () => {
      const result = interpretJob({ success: true, message: 'Done' });
      expect(result.done).toBe(true);
      expect(result.success).toBe(true);
    });

    it('handles done via error field', () => {
      const result = interpretJob({ error: 'Something broke' });
      expect(result.done).toBe(true);
      expect(result.success).toBe(false);
    });

    it('handles done via done field', () => {
      const result = interpretJob({ done: true });
      expect(result.done).toBe(true);
      expect(result.success).toBe(true);
    });
  });

  describe('createRecord', () => {
    it('creates a basic toast record', () => {
      const rec = createRecord('Hello', 'info', {});
      expect(rec.id).toBeTruthy();
      expect(rec.message).toBe('Hello');
      expect(rec.type).toBe('info');
      expect(rec.mode).toBe('toast');
      expect(rec.finished).toBe(false);
      expect(rec.duration).toBe(5000);
      expect(rec.group).toBeNull();
    });

    it('creates a progress record when type is loading', () => {
      const rec = createRecord('Working...', 'loading', {});
      expect(rec.mode).toBe('progress');
      expect(rec.progress).toBe(0);
      expect(rec.duration).toBe(0);
    });

    it('creates a progress record when opts.progress is true', () => {
      const rec = createRecord('Working...', 'info', { progress: true });
      expect(rec.mode).toBe('progress');
      expect(rec.progress).toBe(0);
    });

    it('creates indeterminate progress record', () => {
      const rec = createRecord('Working...', 'loading', { indeterminate: true });
      expect(rec.indeterminate).toBe(true);
    });

    it('sets custom duration', () => {
      const rec = createRecord('Hello', 'info', { duration: 10000 });
      expect(rec.duration).toBe(10000);
    });

    it('sets group', () => {
      const rec = createRecord('Hello', 'info', { group: 'install' });
      expect(rec.group).toBe('install');
    });

    it('copies job config', () => {
      const job = { url: '/api/status', intervalMs: 1000 };
      const rec = createRecord('Installing', 'loading', { job });
      expect(rec.job).toEqual(job);
      expect(rec.job).not.toBe(job); // shallow copy
    });

    it('sets autoCompleteAt100', () => {
      const rec = createRecord('Installing', 'loading', { autoCompleteAt100: false });
      expect(rec.autoCompleteAt100).toBe(false);
    });
  });
});
