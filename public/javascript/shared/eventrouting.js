/* Event → cache routing.
 *
 * The single place that turns realtime events into cache writes, operation
 * updates and toast notifications. Pages subscribe to state/operations; they
 * must NOT each interpret raw events (spec §43: "Do not let every page
 * independently interpret every event.").
 *
 * Pure enough to unit-test: create(opts) with injected { state, ops, toasts }
 * and call handle(event) directly.
 *
 * Exposed surfaces:
 *   window.ALEventRouting.create(opts)
 *   window.ALEventRouting.mapEvent(event)  → array of cache actions (tests)
 *   module.exports (Node tests)
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== "undefined") window.ALEventRouting = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // Resource id helpers.
  function serverIdOf(event) {
    if (!event.resource) return null;
    if (event.resource.type === "server") return String(event.resource.id);
    return null;
  }

  function idOf(event) {
    if (!event.resource) return null;
    return String(event.resource.id);
  }

  // Event type → cache side effects. Returns an array of actions:
  //   { type: 'put', key, data }
  //   { type: 'invalidate', prefix }
  function mapEvent(event) {
    if (!event || typeof event.type !== "string") return [];
    var serverId = serverIdOf(event);
    var actions = [];
    var t = event.type;

    if (t === "server.status.changed") {
      actions.push({
        type: "put",
        key: "server:status:" + serverId,
        data: stamp(event, event.state, "status"),
      });
    } else if (t === "server.stats.changed") {
      actions.push({
        type: "put",
        key: "server:stats:" + serverId,
        data: stamp(event, event.state, "stats"),
      });
    } else if (t === "server.lifecycle.changed") {
      actions.push({
        type: "put",
        key: "server:lifecycle:" + serverId,
        data: stamp(event, event.state, "lifecycle"),
      });
    } else if (
      t === "server.start.queued" ||
      t === "server.start.queue.changed"
    ) {
      actions.push({
        type: "put",
        key: "server:queue:" + serverId,
        data: stamp(event, event.state, "queue"),
      });
    } else if (t === "server.start.cancelled" || t === "server.start.failed") {
      actions.push({
        type: "put",
        key: "server:queue:" + serverId,
        data: {
          queued: false,
          position: null,
          total: 0,
          updatedAt: event.timestamp || Date.now(),
        },
      });
    } else if (
      t.indexOf("server.install.") === 0 ||
      t.indexOf("server.reinstall.") === 0
    ) {
      if (serverId)
        actions.push({
          type: "invalidate",
          prefix: "server:install:" + serverId,
        });
      if (t === "server.install.progress" && event.progress !== undefined) {
        if (serverId)
          actions.push({
            type: "put",
            key: "server:install:progress:" + serverId,
            data: stamp(
              event,
              event.state || { progress: event.progress },
              "install",
            ),
          });
      }
      actions.push({ type: "invalidate", prefix: "server" });
    } else if (t === "backup.started" || t === "backup.progress") {
      if (serverId)
        actions.push({
          type: "put",
          key: "server:backups:active:" + serverId,
          data: stamp(event, event.state, "backups"),
        });
    } else if (
      t === "backup.deleted" ||
      t === "backup.completed" ||
      t === "backup.failed"
    ) {
      if (serverId) {
        actions.push({
          type: "invalidate",
          prefix: "server:backups:" + serverId,
        });
        actions.push({
          type: "put",
          key: "server:backups:active:" + serverId,
          data: null,
        });
        if (t === "backup.deleted")
          actions.push({
            type: "remove",
            prefix: "server:backups:active:" + serverId,
          });
      }
    } else if (
      t === "restore.started" ||
      t === "restore.progress" ||
      t === "restore.completed" ||
      t === "restore.failed"
    ) {
      if (serverId) {
        actions.push({
          type: "invalidate",
          prefix: "server:backups:" + serverId,
        });
      }
    } else if (t === "server.power.started" || t === "server.power.stopped") {
      if (serverId)
        actions.push({
          type: "invalidate",
          prefix: "server:status:" + serverId,
        });
    } else if (
      t === "server.created" ||
      t === "server.deleted" ||
      t === "server.updated"
    ) {
      actions.push({ type: "invalidate", prefix: "server" });
      actions.push({ type: "invalidate", prefix: "admin:servers" });
      if (t === "server.deleted") {
        actions.push({ type: "remove", prefix: "server:" });
      }
    } else if (t === "player.stats.updated") {
      actions.push({ type: "invalidate", prefix: "admin:playerstats" });
    } else if (t.indexOf("node.") === 0) {
      actions.push({ type: "invalidate", prefix: "node" });
      actions.push({ type: "invalidate", prefix: "admin:nodes" });
    } else if (t === "admin.servers.updated") {
      actions.push({ type: "invalidate", prefix: "admin:servers" });
      actions.push({ type: "invalidate", prefix: "server" });
    } else if (
      t === "user.updated" ||
      t === "account.suspended" ||
      t === "account.updated"
    ) {
      actions.push({ type: "invalidate", prefix: "user" });
    } else if (t === "file.updated" || t.indexOf("file.") === 0) {
      actions.push({ type: "invalidate", prefix: "server:files" });
    } else if (t.indexOf("database.") === 0) {
      if (serverId)
        actions.push({
          type: "invalidate",
          prefix: "server:databases:" + serverId,
        });
    } else if (t.indexOf("subuser.") === 0) {
      if (serverId)
        actions.push({
          type: "invalidate",
          prefix: "server:subusers:" + serverId,
        });
    } else if (t.indexOf("schedule.") === 0) {
      if (serverId)
        actions.push({
          type: "invalidate",
          prefix: "server:schedules:" + serverId,
        });
    } else if (t.indexOf("image.") === 0) {
      actions.push({ type: "invalidate", prefix: "image" });
      actions.push({ type: "invalidate", prefix: "admin:images" });
    } else if (t.indexOf("addon.") === 0) {
      actions.push({ type: "invalidate", prefix: "addon" });
    } else if (t.indexOf("settings.") === 0) {
      actions.push({ type: "invalidate", prefix: "admin:settings" });
    } else if (t.indexOf("activity.") === 0) {
      actions.push({ type: "invalidate", prefix: "admin:activity" });
    }

    return actions;
  }

  function stamp(event, data, kind) {
    var out = data;
    if (out && typeof out === "object") out = Object.assign({}, out);
    if (out && typeof out === "object") {
      out.live = true;
      out.updatedAt = event.timestamp || Date.now();
    }
    if (out === undefined || out === null) {
      out = {};
      out.live = true;
      out.updatedAt = event.timestamp || Date.now();
    }
    return out;
  }

  function create(opts) {
    opts = opts || {};
    var state = opts.state || null;
    var ops = opts.ops || null;
    var toasts = opts.toasts || null; // () => { operation: { notify(event, op) } }

    function applyActions(actions) {
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        if (!state) continue;
        if (a.type === "put") {
          state.put(a.key, a.data);
        } else if (a.type === "invalidate") {
          state.invalidate(a.prefix);
        } else if (a.type === "remove") {
          state.removeAll(a.prefix);
        }
      }
    }

    function handle(event) {
      var op = null;
      if (ops) {
        op = ops.apply(event);
      }
      applyActions(mapEvent(event));
      if (toasts && typeof toasts.notify === "function") {
        try {
          toasts.notify(event, op);
        } catch (e) {
          /* toast notification must never break routing */
        }
      }
      return op;
    }

    function destroy() {
      // No ownership of realtime subscriptions here; the bootstrap owns it.
    }

    return {
      handle: handle,
      destroy: destroy,
      mapEvent: mapEvent,
    };
  }

  return {
    create: create,
    mapEvent: mapEvent,
    serverIdOf: serverIdOf,
  };
});
