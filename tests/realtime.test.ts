import { describe, it, expect, vi, beforeEach } from "vitest";
import RealtimeClient from "../public/javascript/shared/realtime.js";

// The transport is `reconnecting-websocket`, which requires a WebSocket that
// supports addEventListener/removeEventListener and the ready-state statics,
// and which this mock exposes so tests can drive open/message/close timing.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Record<string, Array<(evt?: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (evt?: unknown) => void) {
    (this.listeners[type] ||= new Set()).add(fn);
  }

  removeEventListener(type: string, fn: (evt?: unknown) => void) {
    this.listeners[type]?.delete(fn);
  }

  private fire(type: string, evt?: unknown) {
    this.listeners[type]?.forEach((fn) => fn(evt));
  }

  send(m: string) {
    this.sent.push(m);
  }

  close(code?: number) {
    this.readyState = MockWebSocket.CLOSED;
    this.fire("close", { code, reason: "", wasClean: true });
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.fire("open");
  }

  emit(data: unknown) {
    this.fire("message", { data: JSON.stringify(data) });
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
}

// First connection is scheduled via a setTimeout(0) inside rws; flush it under
// fake timers so the underlying socket exists before tests drive the protocol.
async function flushSocket() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("realtime client", () => {
  beforeEach(() => {
    freshMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects and asks for a sync without a stored cursor on first run", async () => {
    const storage = memoryStorage();
    const client = RealtimeClient.create({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      storage,
    });
    await flushSocket();
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].open();
    const sync = JSON.parse(MockWebSocket.instances[0].sent[0]);
    expect(sync).toEqual({ type: "sync", sinceSeq: null });
    client.disconnect();
  });

  it("reconnects with the last seen seq as its cursor", async () => {
    const storage = memoryStorage();
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      storage,
    });
    await flushSocket();
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "realtime.ready", seq: 4 });
    s1.emit({ type: "server.status.changed", seq: 9 });
    expect(client.lastSeq()).toBe(9);

    s1.close();
    // rws backs off ~1s before opening the next socket.
    await vi.advanceTimersByTimeAsync(1200);
    expect(MockWebSocket.instances).toHaveLength(2);
    const s2 = MockWebSocket.instances[1];
    s2.open();
    const sync = JSON.parse(s2.sent[0]);
    expect(sync.sinceSeq).toBe(9);
    client.disconnect();
  });

  it("answers server pings with pong", async () => {
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    });
    await flushSocket();
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "ping", timestamp: 1 });
    expect(s1.sent.some((m) => JSON.parse(m).type === "pong")).toBe(true);
    client.disconnect();
  });

  it("notifies subscribers of fan-out events but not protocol frames", async () => {
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    });
    await flushSocket();
    const received: string[] = [];
    client.subscribe((e) => received.push(e.type));

    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "realtime.ready", seq: 1 });
    s1.emit({ type: "realtime.synced", seq: 2 });
    s1.emit({ type: "server.status.changed", seq: 3 });
    s1.emit({ type: "backup.completed", seq: 4 });
    expect(received).toEqual(["server.status.changed", "backup.completed"]);
    client.disconnect();
  });

  it("tracks connection status through connect and sync", async () => {
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    });
    await flushSocket();
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "realtime.ready", seq: 1 });
    expect(statuses).toContain("connected");
    client.disconnect();
  });

  it("stops reconnecting after an explicit disconnect", async () => {
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    });
    await flushSocket();
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "realtime.ready", seq: 1 });
    client.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("sends watch/unwatch control frames over the open socket", async () => {
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
    });
    await flushSocket();
    const s1 = MockWebSocket.instances[0];
    s1.open();
    expect(client.watch("abc")).toBe(true);
    expect(client.unwatch("abc")).toBe(true);
    expect(s1.sent.map((m) => JSON.parse(m))).toEqual([
      { type: "sync", sinceSeq: null },
      { type: "watch", serverId: "abc" },
      { type: "unwatch", serverId: "abc" },
    ]);
    client.disconnect();
  });

  it("persists the cursor to storage as events stream by", async () => {
    const storage = memoryStorage();
    const client = RealtimeClient.createClient({
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      storage,
    });
    await flushSocket();
    const s1 = MockWebSocket.instances[0];
    s1.open();
    s1.emit({ type: "realtime.ready", seq: 7 });
    s1.emit({ type: "server.power.stopped", seq: 9 });
    expect(storage.getItem(RealtimeClient.SEQ_KEY)).toBe("9");
    client.disconnect();
  });
});
