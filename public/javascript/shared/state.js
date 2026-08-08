/* Shared client-side server-state layer.
 *
 * One cache of server state for the whole application. Provides:
 *   - deduplicated queries (shared in-flight fetches)
 *   - loading / refreshing / stale / error state for every query
 *   - invalidation by key prefix (after a mutation)
 *   - background refetch with a staleness window
 *   - retry with backoff for reads
 *   - cancellation via AbortController
 *   - race protection (a stale response never overwrites newer state)
 *   - observers that pages subscribe to instead of owning fetch logic
 *
 * This module is framework-free and plain CJS/browser-global (like
 * toast-store.js) so it is unit-testable in the Node test environment.
 *
 * Exposed surfaces:
 *   window.ALState.createClient(opts)
 *   module.exports (Node tests)
 *
 * A query is addressed by a string key, e.g. 'server:status:abc'. Prefix
 * invalidation uses 'area:resource' prefixes ('server', 'node', 'admin').
 *
 * Injected deps (for tests): opts.fetcher, opts.storage, opts.now,
 * opts.fetch (raw fetch), opts.setInterval / opts.clearInterval.
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') window.ALState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var QUERY_STATES = ['idle', 'loading', 'refreshing', 'success', 'error', 'stale', 'disabled', 'empty'];

  /* Deterministic retry schedule with jitter. */
  function scheduleRetry(attempt, baseMs, maxMs) {
    var jitter = 0.6 + Math.random() * 0.4;
    return Math.min(maxMs, baseMs * Math.pow(2, attempt)) * jitter;
  }

  function createClient(opts) {
    opts = opts || {};
    var queries = Object.create(null);
    var observers = Object.create(null); // key -> Set<fn>
    var refreshTimers = Object.create(null);
    var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    var setIntervalFn = opts.setInterval || setInterval;
    var clearIntervalFn = opts.clearInterval || clearInterval;
    var now = opts.now || (function () { return Date.now(); });
    var fetchTimeout = typeof opts.fetchTimeout === 'number' ? opts.fetchTimeout : 15000;

    if (!fetchFn) {
      fetchFn = function () {
        return Promise.reject(new Error('no fetch implementation available'));
      };
    }

    function makeRecord(key) {
      return {
        key: key,
        data: undefined,
        status: 'idle',
        fetching: false,
        error: undefined,
        updatedAt: 0,
        attempt: 0,
        version: 0,
        abort: null,
        options: null,
      };
    }

    /* Snapshot handed to observers. */
    function snapshotOf(key) {
      var r = queries[key];
      if (!r) {
        return { key: key, status: 'idle', data: undefined, error: undefined, fetching: false, updatedAt: 0 };
      }
      return {
        key: r.key,
        status: r.status,
        data: r.data,
        error: r.error,
        fetching: r.fetching,
        updatedAt: r.updatedAt,
      };
    }

    function emit(key) {
      var set = observers[key];
      if (set && set.size) {
        set.forEach(function (fn) {
          try { fn(snapshotOf(key)); } catch (e) { /* observer isolation */ }
        });
      }
      // Prefix observers: subscribe to 'server:status', fires for every
      // 'server:status:xyz' change.
      var parts = key.split(':');
      var prefix = '';
      for (var i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? prefix + ':' + parts[i] : parts[i];
        var pset = observers[prefix];
        if (pset && pset.size) {
          pset.forEach(function (fn) {
            try { fn(snapshotOf(key)); } catch (e2) { /* observer isolation */ }
          });
        }
      }
    }

    function runFetch(key, options) {
      var r = queries[key];
      if (!r) return Promise.resolve();
      var version = ++r.version;
      r.fetching = true;
      r.status = r.data !== undefined ? 'refreshing' : 'loading';
      emit(key);

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var controllerObj = null;
      if (controller) controllerObj = { abort: function () { controller.abort(); } };
      r.abort = controllerObj;

      var timer = null;
      if (fetchTimeout > 0) {
        timer = setTimeout(function () { if (controller) controller.abort(); }, fetchTimeout);
      }

      var fetcher = options.fetcher || opts.fetcher || defaultFetcher;

      var p;
      try {
        p = Promise.resolve(fetcher(key, { signal: controller && controller.signal, abort: controllerObj, options: r.options || {} }));
      } catch (err) {
        p = Promise.reject(err);
      }

      // Observers are told about errors via emit(); attach a noop catch so an
      // unhandled rejection never surfaces in the console for a query whose
      // promise no page awaited.
      r.currentPromise = p.then(
        function (data) {
          if (timer) clearTimeout(timer);
          if (version !== r.version) {
            // Superseded: a newer fetch, mutation write or realtime event has
            // claimed this record. Never let the older response stick.
            r.fetching = false;
            r.abort = null;
            emit(key);
            return data;
          }
          r.fetching = false;
          r.data = data;
          r.updatedAt = now();
          r.attempt = 0;
          r.error = undefined;
          r.status = 'success';
          emit(key);
          return data;
        },
        function (err) {
          if (timer) clearTimeout(timer);
          if (version !== r.version) {
            r.fetching = false;
            r.abort = null;
            emit(key);
            throw err; // superseded
          }
          r.fetching = false;
          if (err && err.name === 'AbortError') {
            r.status = r.data !== undefined ? 'success' : r.status;
            if (r.status === 'success') r.error = undefined;
            emit(key);
            throw err;
          }
          r.attempt += 1;
          r.error = err;
          r.status = 'error';
          emit(key);

          var cfg = r.options || {};
          var allowRetry = cfg.retry;
          if (allowRetry === false) throw err;
          var retries = cfg.retry === true || allowRetry === undefined ? 2 : cfg.retry;
          if (r.attempt <= retries) {
            var delay = scheduleRetry(r.attempt - 1, cfg.retryBaseMs || 500, cfg.retryMaxMs || 8000);
            return new Promise(function (resolve) { setTimeout(resolve, delay); }).then(function () {
              if (version !== r.version) throw err;
              return runFetch(key, cfg);
            });
          }
          throw err;
        }
      );
      if (r.currentPromise && typeof r.currentPromise.catch === 'function') {
        r.currentPromise.catch(function () { /* errors surface to observers */ });
      }
      return r.currentPromise;
    }

    function currentVersion(key) {
      var r = queries[key];
      return r ? r.version : 0;
    }

    function defaultFetcher(key) {
      return Promise.reject(new Error('no fetcher configured for ' + key));
    }

    /* Ensure record exists and (optionally) fetch. Returns a snapshot. */
    function query(key, cfg) {
      cfg = cfg || {};
      var r = queries[key];
      if (!r) {
        r = makeRecord(key);
        queries[key] = r;
      }
      r.options = cfg;

      if (cfg.fetcher || cfg.fetchUrl) {
        var shouldFetch = r.data === undefined && !r.fetching;
        var refreshOnMount = !!cfg.refreshOnMount && r.data !== undefined && !r.fetching;
        if (shouldFetch || refreshOnMount) {
          runFetch(key, cfg);
        }
      }
      if (cfg.refetchInterval) ensureRefreshTimer(key);
      return snapshotOf(key);
    }

    /* Ensure a query record exists without fetching. */
    function ensure(key) {
      if (!queries[key]) queries[key] = makeRecord(key);
      return queries[key];
    }

    function ensureRefreshTimer(key) {
      if (refreshTimers[key]) return;
      var r = queries[key];
      if (!r || !r.options || !r.options.refetchInterval) return;
      refreshTimers[key] = setIntervalFn(function () {
        if (typeof document !== 'undefined' && document.hidden) return;
        var rr = queries[key];
        if (!rr) return;
        if (!rr.fetching) {
          runFetch(key, rr.options || {});
        } else {
          // a fetch is already running; next tick will fire
        }
      }, r.options.refetchInterval);
    }

    function get(key) {
      var r = queries[key];
      return r ? r.data : undefined;
    }

    function getQuery(key) {
      return queries[key] || null;
    }

    /* Write data directly into the cache (e.g. from a realtime event). This
       counts as authoritative: any in-flight request for this key is treated
       as superseded so a stale response cannot overwrite the event. */
    function put(key, data, status) {
      var r = queries[key] || makeRecord(key);
      r.version += 1; // supersede in-flight fetches
      if (r.abort) r.abort.abort();
      r.data = data;
      r.error = undefined;
      r.updatedAt = now();
      if (status) r.status = status;
      else if (data === undefined || data === null) r.status = 'empty';
      else {
        // Keep a plain snapshot fresh but preserve authoritative success state.
        r.status = 'success';
      }
      queries[key] = r;
      emit(key);
      return r;
    }

    function setData(key, updater) {
      var r = queries[key] || makeRecord(key);
      r.version += 1;
      if (r.abort) r.abort.abort();
      var next = typeof updater === 'function' ? updater(r.data) : updater;
      r.data = next;
      r.updatedAt = now();
      r.status = next === undefined || next === null ? 'empty' : 'success';
      r.error = undefined;
      queries[key] = r;
      emit(key);
      return r;
    }

    function setStatus(key, status, extra) {
      var r = queries[key] || makeRecord(key);
      if (status === 'loading') {
        r.fetching = true;
        r.status = r.data !== undefined ? 'refreshing' : 'loading';
      } else if (status === 'error') {
        r.fetching = false;
        r.status = 'error';
        r.error = (extra && extra.error) || undefined;
      } else {
        r.fetching = false;
        r.status = status;
      }
      emit(key);
      return r;
    }

    /* Subscribe to a key or prefix. Fires immediately with current snapshot. */
    function observe(key, fn) {
      (observers[key] || (observers[key] = new Set())).add(fn);
      try { fn(snapshotOf(key)); } catch (e) {}
      return function () {
        var set = observers[key];
        if (set) {
          set.delete(fn);
          if (!set.size) delete observers[key];
        }
      };
    }

    /* Invalidate by exact key or prefix; marks stale and refetches if
       anything is observing the key (i.e. UI cares about it). */
    function invalidate(keyOrPrefix) {
      var matched = Object.keys(queries).filter(function (k) {
        return k === keyOrPrefix || k.indexOf(keyOrPrefix) === 0;
      });
      matched.forEach(function (k) {
        var r = queries[k];
        if (!r) return;
        if (r.data !== undefined) r.status = 'stale';
        r.attempt = 0;
        var set = observers[k];
        if (set && set.size && !r.fetching) {
          runFetch(k, r.options || {});
        }
      });
      return matched.length;
    }

    function invalidatePrefix(prefix) {
      return invalidate(prefix);
    }

    function removeAll(prefix) {
      Object.keys(queries)
        .filter(function (k) { return k === prefix || k.indexOf(prefix) === 0; })
        .forEach(function (k) {
          var r = queries[k];
          if (r && r.abort) r.abort.abort();
          delete queries[k];
          if (refreshTimers[k]) { clearIntervalFn(refreshTimers[k]); delete refreshTimers[k]; }
        });
      Object.keys(observers)
        .filter(function (k) { return k === prefix || k.indexOf(prefix) === 0; })
        .forEach(function (k) { delete observers[k]; });
    }

    /* Mutation lifecycle helper. */
    function mutate(key) {
      ensure(key);
      return {
        setStatus: function (status, extra) { setStatus(key, status, extra); },
        setData: function (updater) { setData(key, updater); },
        invalidate: function () { invalidate(key); },
      };
    }

    function clear() {
      Object.keys(queries).forEach(function (k) {
        if (queries[k].abort) queries[k].abort.abort();
      });
      queries = Object.create(null);
      Object.keys(refreshTimers).forEach(function (k) { clearIntervalFn(refreshTimers[k]); });
      refreshTimers = Object.create(null);
    }

    return {
      query: query,
      ensure: ensure,
      get: get,
      getQuery: getQuery,
      put: put,
      setData: setData,
      setStatus: setStatus,
      invalidate: invalidate,
      invalidatePrefix: invalidatePrefix,
      removeAll: removeAll,
      mutate: mutate,
      observe: observe,
      clear: clear,
      isInitialLoading: function (key) {
        var r = queries[key];
        return !!r && r.fetching && r.data === undefined;
      },
    };
  }

  return {
    createClient: createClient,
    QUERY_STATES: QUERY_STATES,
    scheduleRetry: scheduleRetry,
  };
});