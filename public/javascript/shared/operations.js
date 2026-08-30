/* Client-side global operation registry.
 *
 * One authoritative place for the operations the UI must see across page
 * navigation: power actions, installs, backups/restores, transfers.
 *
 * Operations are reconciled from realtime events (see eventrouting.js). The
 * operation id is derived from the event type + server id, so duplicate or
 * replayed events are harmless and out-of-order delivery simply re-applies
 * state that was already terminal (terminal states clamp everything later).
 *
 * This module is framework-free and plain CJS/browser-global (like
 * toast-store.js) so it is unit-testable in the Node test environment. Layout
 * stays in the pages; this file only owns records and their transitions.
 *
 * Exposed surfaces:
 *   window.ALOperations.create(opts)
 *   window.ALOperations.mapEventToOp(event)
 *   module.exports (Node tests)
 *
 * Operation record shape (prefix §93 of the master task):
 *   { id, operationId, opType, resourceType, resourceId, status, stage,
 *     progress, startedAt, updatedAt, completedAt, error, seq }
 *
 * status: queued | running | waiting | progressing | succeeded | failed | cancelled
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== "undefined") window.ALOperations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
  var DEFAULT_MAX = 25;

  // Event type → canonical operation type (the identity of the op record).
  var EVENT_TO_OP = {
    "server.power.start.started": "server.start",
    "server.power.started": "server.start",
    "server.power.start.failed": "server.start",
    "server.power.stop.started": "server.stop",
    "server.power.stopped": "server.stop",
    "server.power.stop.failed": "server.stop",
    "server.power.restart.started": "server.restart",
    "server.power.restart.completed": "server.restart",
    "server.power.restart.failed": "server.restart",
    "server.start.queued": "server.start",
    "server.start.queue.changed": "server.start",
    "server.start.cancelled": "server.start",
    "server.start.failed": "server.start",
    "server.install.started": "server.install",
    "server.install.progress": "server.install",
    "server.install.completed": "server.install",
    "server.install.failed": "server.install",
    "server.reinstall.started": "server.install",
    "server.reinstall.progress": "server.install",
    "server.reinstall.completed": "server.install",
    "server.reinstall.failed": "server.install",
    "backup.started": "backup.create",
    "backup.progress": "backup.create",
    "backup.completed": "backup.create",
    "backup.failed": "backup.create",
    "restore.started": "backup.restore",
    "restore.progress": "backup.restore",
    "restore.completed": "backup.restore",
    "restore.failed": "backup.restore",
    "server.transfer.started": "server.transfer",
    "server.transfer.completed": "server.transfer",
    "server.transfer.failed": "server.transfer",
    "server.delete.started": "server.delete",
    "server.delete.completed": "server.delete",
    "server.delete.failed": "server.delete",
  };

  function reportToOp(event) {
    if (!event || typeof event.type !== "string") return null;
    var type = EVENT_TO_OP[event.type];
    if (!type) return null;
    var serverId =
      event.resource && event.resource.type === "server"
        ? String(event.resource.id)
        : null;
    if (!serverId) return null;
    return { type: type, serverId: serverId, key: type + ":" + serverId };
  }

  function statusForType(type) {
    if (/\.failed$/.test(type)) return "failed";
    if (/\.cancelled$/.test(type)) return "cancelled";
    if (/\.queued$/.test(type)) return "queued";
    if (/\.progress$/.test(type)) return "progressing";
    if (/\.(completed|stopped)$/.test(type) || type === "server.power.started")
      return "succeeded";
    return "running";
  }

  function parseProgress(event) {
    if (typeof event.progress === "number") return event.progress;
    var state = event.state;
    if (state && typeof state.progress === "number") return state.progress;
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var store = opts.store || null;
    var now =
      opts.now ||
      function () {
        return Date.now();
      };
    var listeners = [];
    var ops = new Map();

    seed();

    function seed() {
      if (!store) return;
      var saved = store.load();
      saved.forEach(function (r) {
        if (!r || !r.opType || !r.resourceId) return;
        ops.set(r.opType + ":" + r.resourceId, Object.assign({}, r));
      });
    }

    function notify() {
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i]();
        } catch (e) {
          /* listener isolation */
        }
      }
    }

    function persist() {
      if (!store) return;
      var list = sortedOps()
        .filter(function (r) {
          return !isTerminal(r);
        })
        .slice(0, DEFAULT_MAX);
      store.save(list);
    }

    function emit() {
      notify();
      persist();
    }

    /* Reconcile a realtime event. Returns the updated record, or null when
       the event does not describe an operation. */
    function apply(event) {
      var mapped = reportToOp(event);
      if (!mapped) return null;
      var key = mapped.key;
      var rec = ops.get(key);
      var status = statusForType(event.type);
      var rerunStart = isReRunStart(event.type);

      if (!rec || (rerunStart && isTerminal(rec))) {
        rec = {
          id: key,
          operationId: event.operationId || key,
          opType: mapped.type,
          type: mapped.type,
          resourceType: "server",
          resourceId: mapped.serverId,
          status: status,
          stage: status,
          progress: parseProgress(event),
          startedAt: event.timestamp || now(),
          updatedAt: event.timestamp || now(),
          completedAt: null,
          error: event.error
            ? { message: event.error.message, code: event.error.code }
            : null,
          seq: event.seq,
        };
        ops.set(key, rec);
        emit();
        return rec;
      }

      // Duplicates and terminal clamps: a start event after a completed/failed
      // op begins a brand new op; anything on a terminal record is ignored.
      if (isTerminal(rec)) return rec;

      rec.status = status;
      rec.stage = status;
      if (event.error)
        rec.error = { message: event.error.message, code: event.error.code };
      var p = parseProgress(event);
      if (p !== null) rec.progress = p;
      if (event.operationId) rec.operationId = event.operationId;
      if (event.seq) rec.seq = event.seq;
      rec.updatedAt = event.timestamp || now();
      if (
        status === "succeeded" ||
        status === "failed" ||
        status === "cancelled"
      ) {
        rec.completedAt = rec.updatedAt;
      }
      emit();
      return rec;
    }

    function isReRunStart(eventType) {
      // Only initiation events begin a fresh operation; a repeat of a
      // completion event (e.g. a buffered duplicate of `server.power.started`)
      // must never reset a finished op.
      return (
        eventType === "server.power.start.started" ||
        eventType === "server.power.stop.started" ||
        eventType === "server.install.started" ||
        eventType === "server.reinstall.started" ||
        eventType === "backup.started" ||
        eventType === "restore.started" ||
        eventType === "server.transfer.started"
      );
    }

    function isTerminal(rec) {
      return TERMINAL.has(rec.status);
    }

    function get(key) {
      return ops.get(key) || null;
    }

    function byServer(serverId) {
      var out = [];
      ops.forEach(function (o) {
        if (o.resourceId === serverId) out.push(o);
      });
      out.sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      return out;
    }

    function active() {
      return sortedOps().filter(function (o) {
        return !isTerminal(o);
      });
    }

    function recent() {
      return sortedOps().slice(0, DEFAULT_MAX);
    }

    function sortedOps() {
      var out = Array.from(ops.values());
      out.sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      return out;
    }

    function onChange(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function clear() {
      ops.clear();
      emit();
    }

    var api = {
      apply: apply,
      get: get,
      byServer: byServer,
      active: active,
      recent: recent,
      onChange: onChange,
      clear: clear,
      isTerminal: isTerminal,
    };
    Object.defineProperty(api, "_ops", {
      get: function () {
        return ops;
      },
    });
    return api;
  }

  return {
    create: create,
    EVENT_TO_OP: EVENT_TO_OP,
    reportToOp: reportToOp,
    TERMINAL: TERMINAL,
  };
});
