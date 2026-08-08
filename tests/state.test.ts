import { describe, it, expect, vi, beforeEach } from 'vitest';
// Plain CJS module, browser-global + Node export, testable directly.
import ALState from '../public/javascript/shared/state.js';

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

function deferred<T = unknown>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Fetcher that returns controllable promises so tests can interleave and race.
function controllableFetcher(calls: Deferred[]) {
  return () => {
    const d = deferred();
    calls.push(d);
    return d.promise as Promise<unknown>;
  };
}

// The query engine (@tanstack/query-core) schedules fetch work on
// setTimeout(0); flush it the same way realtime.test.ts does.
// Requires vi.useFakeTimers() to be active.
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

// For tests that keep real timers: resolving a promised fetch still needs a
// couple of microtask turns (the notify cycle is Promise-scheduled).
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('state client', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates concurrent queries for the same key', () => {
    const client = ALState.createClient();
    const calls: Deferred[] = [];
    const fetcher = controllableFetcher(calls);

    client.query('server:status:abc', { fetcher });
    client.query('server:status:abc', { fetcher });
    expect(calls).toHaveLength(1);
  });

  it('moves loading → success and keeps the snapshot observable', async () => {
    vi.useFakeTimers();
    const client = ALState.createClient();
    const seen: string[] = [];
    client.observe('server:status:abc', (s) => seen.push(s.status));

    client.query('server:status:abc', {
      fetcher: () => Promise.resolve({ running: true }),
    });
    // Initial emission happened first (idle), then loading.
    expect(seen).toContain('loading');

    await flush();
    await flush();
    const rec = client.getQuery('server:status:abc');
    expect(rec.status).toBe('success');
    expect(client.get('server:status:abc')).toEqual({ running: true });
    expect(seen).toContain('success');
  });

  it('does not blank existing data during background refetch', async () => {
    vi.useFakeTimers();
    const client = ALState.createClient();
    const calls: Deferred[] = [];
    const fetcher = controllableFetcher(calls);

    client.query('server:status:abc', {
      fetcher,
      refreshOnMount: true,
    });
    calls[0].resolve({ running: true });
    await flush();
    await flush();
    expect(client.get('server:status:abc')).toEqual({ running: true });

    // Force a background refetch: existing data stays visible while loading.
    client.query('server:status:abc', { fetcher, refreshOnMount: true });
    await flush();
    expect(client.get('server:status:abc')).toEqual({ running: true });
    expect(client.getQuery('server:status:abc').status).toBe('refreshing');
  });

  it('put supersedes an in-flight request (stale response cannot overwrite)', async () => {
    const client = ALState.createClient();
    const calls: Deferred[] = [];
    const fetcher = controllableFetcher(calls);

    client.query('server:status:abc', { fetcher });
    // Real-time event arrives while the HTTP fetch is still in flight.
    client.put('server:status:abc', { running: false });
    expect(client.get('server:status:abc')).toEqual({ running: false });

    // The slow (older) HTTP response resolves afterwards.
    calls[0].resolve({ running: true });
    await settle();
    await settle();

    const after = client.getQuery('server:status:abc');
    expect(after.data).toEqual({ running: false });
    expect(after.fetching).toBe(false);
    expect(after.status).toBe('success');
  });

  it('notifies observers of a key and of its prefix', async () => {
    const client = ALState.createClient();
    const exact = vi.fn();
    const prefix = vi.fn();
    client.observe('server:status:abc', exact);
    client.observe('server:status', prefix);

    client.put('server:status:abc', { running: true });
    expect(exact).toHaveBeenCalled();
    expect(prefix).toHaveBeenCalled();
  });

  it('invalidate refetches only keys that are observed', async () => {
    const client = ALState.createClient();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve({ n: calls });
    };

    // Unobserved key: invalidate marks stale but does not refetch.
    client.query('server:status:unwatched', { fetcher });
    await settle();
    await settle();
    expect(calls).toBe(1);
    client.invalidate('server:status:unwatched');
    expect(client.getQuery('server:status:unwatched').status).toBe('stale');
    await settle();
    await settle();
    expect(calls).toBe(1);

    // Observed key: invalidate triggers a refetch.
    client.observe('server:status:watched', () => {
      /* UI cares about this key */
    });
    client.query('server:status:watched', { fetcher });
    await settle();
    await settle();
    expect(calls).toBe(2);
    client.invalidate('server:status');
    await settle();
    await settle();
    expect(calls).toBe(3);
    expect(client.getQuery('server:status:watched').status).toBe('success');
  });

  it('supports prefix invalidation and removeAll', () => {
    const client = ALState.createClient();
    client.put('node:stats:1', { cpu: 10 });
    client.put('node:stats:2', { cpu: 20 });
    client.put('server:status:abc', { running: false });

    client.removeAll('node');
    expect(client.get('node:stats:1')).toBeUndefined();
    expect(client.get('node:stats:2')).toBeUndefined();
    expect(client.get('server:status:abc')).toEqual({ running: false });
  });

  it('setData applies an updater to the existing value', () => {
    const client = ALState.createClient();
    client.put('server:status:abc', { running: false, ram: 512 });
    client.setData('server:status:abc', (prev) => ({ ...prev, ram: 1024 }));
    expect(client.get('server:status:abc')).toEqual({ running: false, ram: 1024 });
  });

  it('surfaces a fetch error instead of returning undefined', async () => {
    const client = ALState.createClient();
    client.query('server:status:err', {
      fetcher: () => Promise.reject(new Error('boom')),
      retry: false,
    });
    // Loading first.
    expect(client.getQuery('server:status:err').status).toBe('loading');
    await settle();
    await settle();
    expect(client.getQuery('server:status:err').status).toBe('error');
    expect(client.getQuery('server:status:err').error.message).toBe('boom');
    expect(client.getQuery('server:status:err').data).toBeUndefined();
  });

  it('retries with backoff and succeeds on a later attempt', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const client = ALState.createClient();
    const done = deferred();
    client.observe('server:status:retry', (s) => {
      if (s.status === 'success' && s.data) done.resolve(s.data as unknown);
    });
    client.query('server:status:retry', {
      fetcher: () => {
        attempts += 1;
        if (attempts < 3) return Promise.reject(new Error('temporary'));
        return Promise.resolve({ ok: true });
      },
      retry: true,
      retryBaseMs: 10,
      retryMaxMs: 100,
    });
    for (let i = 0; i < 30 && attempts < 3; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }
    await done.promise;
    expect(client.get('server:status:retry')).toEqual({ ok: true });
    expect(attempts).toBe(3);
    vi.useRealTimers();
  });

  it('isInitialLoading is true only for the first fetch', async () => {
    const client = ALState.createClient();
    const calls: Deferred[] = [];
    client.query('server:status:abc', { fetcher: controllableFetcher(calls) });
    expect(client.isInitialLoading('server:status:abc')).toBe(true);
    calls[0].resolve({ running: true });
    await settle();
    await settle();
    expect(client.isInitialLoading('server:status:abc')).toBe(false);
  });
});