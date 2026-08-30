/* Shared toast persistence layer.
 *
 * Pure data module consumed by views/components/toast.ejs. It only decides
 * how toast records are stored, loaded, deduped and expired; toast.ejs owns
 * all DOM rendering. Exposing this as its own file keeps the survival rules
 * (rehydrate after navigation, resolve long-running jobs) unit-testable in
 * Node while remaining a plain browser global for the inline toast script.
 *
 * Exposed surfaces:
 *   window.ALToastStore.createStore(storage, opts)
 *   window.ALToastStore.KEY
 *   window.ALToastStore.uid()
 *   window.ALToastStore.isExpired(record, now)
 *   window.ALToastStore.remainingMs(record, now)
 *   module.exports (Node tests)
 *
 * `storage` is injected (the panel passes sessionStorage); every access is
 * wrapped so a privacy-mode / disabled storage degrades to "no persistence"
 * instead of throwing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== "undefined") window.ALToastStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var KEY = "__al_toasts__";
  // Safety cap so a session cannot grow an unbounded list.
  var DEFAULT_MAX = 20;
  // A finished toast stays restorable on a later page for the same window
  // the live toast is visible plus a little animation grace.
  var FINISHED_VIEW_MS = { success: 2600, error: 6500 };
  var TOAST_GRACE_MS = 500;
  var FINISHED_GRACE_MS = 400;

  function uid() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return (
      "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    );
  }

  function parseList(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /* A record is expired when it can no longer meaningfully re-render:
   * - finished toasts leave after their visibility window (+ grace),
   * - plain toasts leave once their dismiss duration has passed (+ grace),
   * - progress jobs never expire while running.
   */
  function isExpired(record, now) {
    if (!record || typeof record !== "object") return true;
    var started = record.startedAt || record.createdAt || 0;
    if (record.finished === true && typeof record.finishedAt === "number") {
      var view =
        record.success === false
          ? FINISHED_VIEW_MS.error
          : FINISHED_VIEW_MS.success;
      return now - record.finishedAt > view + FINISHED_GRACE_MS;
    }
    if (
      record.mode !== "active" &&
      typeof record.duration === "number" &&
      record.duration > 0
    ) {
      return now - started > record.duration + TOAST_GRACE_MS;
    }
    return false;
  }

  function remainingMs(record, now) {
    if (!record || typeof record !== "object") return 0;
    if (record.finished === true && typeof record.finishedAt === "number") {
      var view =
        record.success === false
          ? FINISHED_VIEW_MS.error
          : FINISHED_VIEW_MS.success;
      return Math.max(0, record.finishedAt + view - now);
    }
    if (record.mode !== "active" && typeof record.duration === "number") {
      return Math.max(0, (record.startedAt || now) + record.duration - now);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function createStore(storage, opts) {
    opts = opts || {};
    var max = typeof opts.max === "number" ? opts.max : DEFAULT_MAX;

    function read() {
      if (!storage || typeof storage.getItem !== "function") return [];
      var raw;
      try {
        raw = storage.getItem(KEY);
      } catch (e) {
        return [];
      }
      var now = Date.now();
      return pruneNow(parseList(raw), now);
    }

    function write(list) {
      if (!storage || typeof storage.setItem !== "function") return false;
      try {
        storage.setItem(KEY, JSON.stringify(list));
        return true;
      } catch (e) {
        return false;
      }
    }

    function pruneNow(list, now) {
      now = now || Date.now();
      return list.filter(function (r) {
        return !isExpired(r, now);
      });
    }

    function dedupByGroup(list) {
      var seen = {};
      return list.filter(function (r) {
        if (!r || !r.group) return true;
        if (r.finished) return true;
        if (seen[r.group]) return false;
        seen[r.group] = true;
        return true;
      });
    }

    return {
      KEY: KEY,
      load: function () {
        return read();
      },
      save: function (list) {
        return write(maxByAge(pruneNow(dedupByGroup(list))));
      },
      upsert: function (record) {
        var list = read();
        var idx = list.findIndex(function (r) {
          return r && r.id === record.id;
        });
        if (idx >= 0) list[idx] = record;
        else list.push(record);
        write(maxByAge(list));
        return record;
      },
      update: function (id, patch) {
        var list = read();
        var idx = list.findIndex(function (r) {
          return r && r.id === id;
        });
        if (idx < 0) return null;
        var merged = Object.assign({}, list[idx], patch);
        list[idx] = merged;
        write(maxByAge(list));
        return merged;
      },
      remove: function (id) {
        var list = read();
        var next = list.filter(function (r) {
          return !r || r.id !== id;
        });
        if (next.length !== list.length) write(next);
      },
      clear: function () {
        write([]);
      },
      byGroup: function (group) {
        return read().filter(function (r) {
          return r && r.group === group;
        });
      },
    };
  }

  // Keep newest records when the cap is exceeded; finished ones drop first.
  function maxByAge(list) {
    var max = DEFAULT_MAX;
    if (list.length <= max) return list;
    return list
      .slice()
      .sort(function (a, b) {
        var ta = (a && (a.finishedAt || 0)) || 0;
        var tb = (b && (b.finishedAt || 0)) || 0;
        if (ta && !tb) return -1;
        if (tb && !ta) return 1;
        return (b && (b.startedAt || 0)) - (a && (a.startedAt || 0));
      })
      .slice(0, max);
  }

  return {
    KEY: KEY,
    uid: uid,
    createStore: createStore,
    isExpired: isExpired,
    remainingMs: remainingMs,
  };
});
