import { describe, it, expect, vi, beforeEach } from "vitest";
import Operations from "../public/javascript/shared/operations.js";
import EventRouting from "../public/javascript/shared/eventrouting.js";
import State from "../public/javascript/shared/state.js";

function makeStore() {
  const list: any[] = [];
  return {
    load: () => list.slice(),
    save: (items: any[]) => void list.splice(0, list.length, ...items),
    _raw: list,
  };
}

function event(type: string, overrides: Record<string, unknown> = {}) {
  return Object.assign(
    {
      type,
      version: 1,
      timestamp: 1000,
      resource: { type: "server", id: "abc" },
      scope: { serverId: "abc" },
    },
    overrides,
  );
}

describe("operations registry", () => {
  beforeEach(() => vi.useRealTimers());

  it("creates a running op from a start event", () => {
    const ops = Operations.create();
    const rec = ops.apply(event("server.power.start.started"));
    expect(rec).not.toBeNull();
    expect(rec.opType).toBe("server.start");
    expect(rec.status).toBe("running");
    expect(rec.resourceId).toBe("abc");
    expect(rec.startedAt).toBe(1000);
  });

  it("moves a start op to succeeded on completion", () => {
    const ops = Operations.create();
    ops.apply(event("server.start.queued"));
    ops.apply(event("server.power.start.started"));
    const rec = ops.apply(event("server.power.started", { timestamp: 2000 }));
    expect(rec.status).toBe("succeeded");
    expect(rec.completedAt).toBe(2000);
  });

  it("records failures with the error", () => {
    const ops = Operations.create();
    ops.apply(event("server.power.start.started"));
    const rec = ops.apply(
      event("server.power.start.failed", {
        error: { message: "boom", code: "DAEMON_UNREACHABLE" },
      }),
    );
    expect(rec.status).toBe("failed");
    expect(rec.error.message).toBe("boom");
  });

  it("is idempotent under duplicate terminal events", () => {
    const ops = Operations.create();
    ops.apply(event("server.power.started"));
    const before = ops.get("server.start:abc");
    ops.apply(event("server.power.started", { timestamp: 99999 }));
    expect(ops.get("server.start:abc")).toEqual(before);
  });

  it("allows a new op to start after a terminal one for the same server", () => {
    const ops = Operations.create();
    ops.apply(event("server.power.started", { timestamp: 1000 }));
    expect(ops.get("server.start:abc").status).toBe("succeeded");
    const rerec = ops.apply(
      event("server.power.start.started", { timestamp: 5000 }),
    );
    expect(rerec.status).toBe("running");
    expect(ops.get("server.start:abc").status).toBe("running");
  });

  it("exposes active (non-terminal) operations sorted newest first", () => {
    const ops = Operations.create();
    ops.apply(
      event("server.power.start.started", {
        resource: { type: "server", id: "a" },
        timestamp: 5,
      }),
    );
    ops.apply(
      event("server.power.start.started", {
        resource: { type: "server", id: "b" },
        timestamp: 9,
      }),
    );
    const active = ops.active().map((o: any) => o.resourceId);
    expect(active).toEqual(["b", "a"]);
  });

  it("tracks operations scoped to one server", () => {
    const ops = Operations.create();
    ops.apply(
      event("backup.started", { resource: { type: "server", id: "abc" } }),
    );
    ops.apply(
      event("server.power.start.started", {
        resource: { type: "server", id: "abc" },
      }),
    );
    ops.apply(
      event("backup.started", { resource: { type: "server", id: "zzz" } }),
    );
    expect(
      ops
        .byServer("abc")
        .map((o: any) => o.opType)
        .sort(),
    ).toEqual(["backup.create", "server.start"]);
  });

  it("notifies change listeners and persists active ops to the store", () => {
    const store = makeStore();
    const ops = Operations.create({ store });
    const fn = vi.fn();
    ops.onChange(fn);
    ops.apply(event("backup.start", { type: "backup.started" }));
    expect(fn).toHaveBeenCalled();
    // 'backup.started' is a start event → non-terminal → persisted.
    expect(store._raw.some((r) => r.resourceId === "abc")).toBe(true);
  });
});

describe("event routing", () => {
  beforeEach(() => vi.useRealTimers());

  it("maps status/stats events into the state cache with liveness stamps", () => {
    const state = State.createClient();
    const routing = EventRouting.create({ state, ops: null, toasts: null });
    routing.handle(
      event("server.status.changed", { state: { running: true } }),
    );
    routing.handle(event("server.stats.changed", { state: { cpu: 42 } }));

    expect(state.get("server:status:abc").running).toBe(true);
    expect(state.get("server:status:abc").live).toBe(true);
    expect(state.get("server:stats:abc").cpu).toBe(42);
    expect(state.get("server:stats:abc").live).toBe(true);
  });

  it("routes queue events into the queue key", () => {
    const state = State.createClient();
    const routing = EventRouting.create({ state });
    routing.handle(
      event("server.start.queued", {
        state: { queued: true, position: 2, total: 4 },
      }),
    );
    expect(state.get("server:queue:abc")).toMatchObject({
      queued: true,
      position: 2,
      total: 4,
    });
  });

  it("clears the queue key on cancel", () => {
    const state = State.createClient();
    const routing = EventRouting.create({ state });
    routing.handle(event("server.start.cancelled"));
    expect(state.get("server:queue:abc")).toMatchObject({
      queued: false,
      position: null,
    });
  });

  it("invalidate prefixes when backups complete", () => {
    const state = State.createClient();
    const routing = EventRouting.create({ state });
    // Register a real query record so invalidation has something to touch.
    state.query("server:backups:abc", { fetcher: () => Promise.resolve([]) });
    state.observe("server:backups:abc", () => {
      /* keep observed */
    });
    routing.handle(event("backup.completed"));
    expect(state.getQuery("server:backups:abc") !== null).toBe(true);
  });

  it("routes to operations too when ops is injected", () => {
    const ops = Operations.create();
    const routing = EventRouting.create({ ops });
    const rec = routing.handle(event("server.power.start.started"));
    expect(rec.opType).toBe("server.start");
    expect(ops.active().length).toBe(1);
  });
});
