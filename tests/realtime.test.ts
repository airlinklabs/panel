import { describe, it, expect, vi, beforeEach } from 'vitest';
import RealtimeClient from '../public/javascript/shared/realtime.js';

// A deterministic WebSocket with an injectable backoff scheduler.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static nextOpen: boolean = true;

  url: string;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(m: string) {
    this.sent.push(m);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }

  open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  emit(data: unknown) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}

function memoryStorage(seed?: { seq?: string }) {
  const map = new Map<string, string>();
  if (seed?.seq) map.set(RealtimeClient.SEQ_KEY, seed.seq);
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function freshMocks() {
  MockWebSocket.instances = [];
  MockWebSocket.nextOpen = true;
}

describe('realtime client', () => {
  beforeEach(() => {
    freshMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects and asks for a sync without a stored cursor on first run', () => {
    const storage = memoryStorage();
    const client = RealtimeClient.create({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      storage,
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].open();
    const sync = JSON.parse(MockWebSocket.instances[0].sent[0]);
    expect(sync).toEqual({ type: 'sync', sinceSeq: null });
    client.disconnect();
  });

  it('reconnects with the last seen seq as its cursor', () => {
    const storage = memoryStorage();
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      storage,
    });
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'realtime.ready', seq: 4 });
    s1.emit({ type: 'server.status.changed', seq: 9 });
    expect(client.lastSeq()).toBe(9);

    s1.close();
    // Backoff reconnect opens a fresh socket (advance ~1s).
    vi.advanceTimersByTime(1200);
    expect(MockWebSocket.instances).toHaveLength(2);
    const s2 = MockWebSocket.instances[1];
    s2.open();
    const sync = JSON.parse(s2.sent[0]);
    expect(sync.sinceSeq).toBe(9);
    client.disconnect();
  });

  it('answers server pings with pong', () => {
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket });
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'ping', timestamp: 1 });
    expect(s1.sent.some((m) => JSON.parse(m).type === 'pong')).toBe(true);
    client.disconnect();
  });

  it('notifies subscribers of fan-out events but not protocol frames', () => {
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket });
    const received: string[] = [];
    client.subscribe((e) => received.push(e.type));

    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'realtime.ready', seq: 1 });
    s1.emit({ type: 'realtime.synced', seq: 2 });
    s1.emit({ type: 'server.status.changed', seq: 3 });
    s1.emit({ type: 'backup.completed', seq: 4 });
    expect(received).toEqual(['server.status.changed', 'backup.completed']);
    client.disconnect();
  });

  it('tracks connection status through connect and sync', () => {
    const statuses: string[] = [];
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket });
    client.onStatusChange((s) => statuses.push(s));
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'realtime.ready', seq: 1 });
    expect(statuses).toContain('connected');
    client.disconnect();
  });

  it('stops reconnecting after an explicit disconnect', () => {
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket });
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'realtime.ready', seq: 1 });
    client.disconnect();
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('sends watch/unwatch control frames over the open socket', () => {
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket });
    const s1 = MockWebSocket.instances[0];
    s1.open();
    expect(client.watch('abc')).toBe(true);
    expect(client.unwatch('abc')).toBe(true);
    expect(s1.sent.map((m) => JSON.parse(m))).toEqual([
      { type: 'sync', sinceSeq: null },
      { type: 'watch', serverId: 'abc' },
      { type: 'unwatch', serverId: 'abc' },
    ]);
    client.disconnect();
  });

  it('persists the cursor to storage as events stream by', () => {
    const storage = memoryStorage();
    const client = RealtimeClient.createClient({ WebSocket: MockWebSocket as unknown as typeof WebSocket, storage });
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: 'realtime.ready', seq: 7 });
    s1.emit({ type: 'server.power.stopped', seq: 9 });
    expect(storage.getItem(RealtimeClient.SEQ_KEY)).toBe('9');
    client.disconnect();
  });
});