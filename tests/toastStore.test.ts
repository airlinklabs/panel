import { describe, it, expect, vi, beforeEach } from 'vitest';
// The shared toast store is a plain CJS module with no browser dependencies,
// so it can be unit-tested directly in the Node environment.
import ToastStore from '../public/javascript/shared/toast-store.js';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _raw: map,
  };
}

function progressRecord(overrides: Record<string, unknown> = {}) {
  return Object.assign(
    {
      id: ToastStore.uid(),
      mode: 'progress',
      message: 'Working…',
      type: 'loading',
      startedAt: Date.now(),
      progress: 40,
      finished: false,
      success: null,
      finishedAt: null,
    },
    overrides,
  );
}

describe('toast-store', () => {
  beforeEach(() => vi.useRealTimers());

  it('round-trips records through the injected storage', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const rec = progressRecord();

    store.save([rec]);
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(rec.id);
    expect(loaded[0].progress).toBe(40);
  });

  it('upserts by id and updates existing records in place', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const rec = progressRecord();
    store.upsert(rec);
    store.upsert(Object.assign({}, rec, { progress: 75 }));
    expect(store.load()).toHaveLength(1);
    expect(store.load()[0].progress).toBe(75);
  });

  it('removes a record by id', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const a = progressRecord();
    const b = progressRecord();
    store.save([a, b]);
    store.remove(a.id);
    expect(store.load().map((r) => r.id)).toEqual([b.id]);
  });

  it('drops finished success toasts after their visibility window', () => {
    const now = 1_000_000;
    vi.setSystemTime(now);
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const done = progressRecord({ finished: true, success: true, finishedAt: now - 10_000 });
    store.save([done]);
    expect(store.load()).toHaveLength(0);
  });

  it('keeps finished error toasts visible noticeably longer', () => {
    const now = 1_000_000;
    vi.setSystemTime(now);
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const done = progressRecord({ finished: true, success: false, finishedAt: now - 3_000 });
    store.save([done]);
    expect(store.load()).toHaveLength(1);
  });

  it('expires plain toasts once their dismiss duration has passed', () => {
    const now = 2_000_000;
    vi.setSystemTime(now);
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const toast = progressRecord({ mode: 'toast', startedAt: now - 6_000, duration: 5_000 });
    store.save([toast]);
    expect(store.load()).toHaveLength(0);
  });

  it('never expires a running progress job on its own', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const rec = progressRecord({ finished: false });
    store.save([rec]);
    expect(store.load()).toHaveLength(1);
  });

  it('remainingMs returns 0 once the record cannot be shown anymore', () => {
    const now = 3_000_000;
    const toast = progressRecord({ mode: 'toast', startedAt: now - 10_000, duration: 5_000 });
    expect(ToastStore.remainingMs(toast, now)).toBe(0);
    const live = progressRecord({ mode: 'toast', startedAt: now - 1_000, duration: 5_000 });
    expect(ToastStore.remainingMs(live, now)).toBe(4_000);
  });

  it('caps the number of persisted records', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const many = Array.from({ length: 30 }, () => progressRecord());
    store.save(many);
    expect(store.load().length).toBeLessThanOrEqual(20);
  });

  it('finds records by group', () => {
    const storage = memoryStorage();
    const store = ToastStore.createStore(storage);
    const g = progressRecord({ group: 'backup:abc' });
    const other = progressRecord({ group: null });
    store.save([g, other]);
    const found = store.byGroup('backup:abc');
    expect(found).toHaveLength(1);
    expect(found[0].group).toBe('backup:abc');
  });

  it('degrades gracefully when storage is unavailable', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as Storage;
    const store = ToastStore.createStore(throwing);
    expect(store.load()).toEqual([]);
    expect(store.save([progressRecord()])).toBe(false);
    expect(store.load()).toEqual([]);
  });

  it('ignores corrupted payloads instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem(ToastStore.KEY, 'not json{{{');
    const store = ToastStore.createStore(storage);
    expect(store.load()).toEqual([]);
  });
});
