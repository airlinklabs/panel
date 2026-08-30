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
 * Engine: @tanstack/query-core, vendored for the browser as `window.ALQuery`
 * (public/javascript/vendor/query-core.js) and resolved with require() in the
 * Node test environment. This module is a thin facade that keeps the exact
 * string-keyed API pages and tests already use:
 *
 *   window.ALState.createClient(opts)
 *   module.exports (Node tests)
 *
 * A query is addressed by a string key, e.g. 'server:status:abc'; the facade
 * maps it to a queryKey array split on ':' so @tanstack prefix matching
 * ('server', 'server:status') works without extra bookkeeping.
 *
 * Injected deps (for tests): opts.fetcher, opts.fetch (raw fetch),
 * opts.setInterval / opts.clearInterval, opts.fetchTimeout.
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== "undefined") window.ALState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var QUERY_STATES = [
    "idle",
    "loading",
    "refreshing",
    "success",
    "error",
    "stale",
    "disabled",
    "empty",
  ];

  function loadQueryCore() {
    if (typeof window !== "undefined" && window.ALQuery) return window.ALQuery;
    if (typeof require === "function") {
      try {
        return require("@tanstack/query-core");
      } catch (e) {
        /* fall through */
      }
    }
    return null;
  }

  var Core = loadQueryCore();
  if (!Core) {
    throw new Error(
      'ALState: @tanstack/query-core is not available (window.ALQuery or require("@tanstack/query-core"))',
    );
  }

  /* Deterministic retry schedule with jitter. */
  function scheduleRetry(attempt, baseMs, maxMs) {
    var jitter = 0.6 + Math.random() * 0.4;
    return Math.min(maxMs, baseMs * Math.pow(2, attempt)) * jitter;
  }

  /* 'server:status:abc' -> ['server', 'status', 'abc'] */
  function toQueryKey(key) {
    return String(key).split(":");
  }

  function matchesPrefix(key, prefixString) {
    return key === prefixString || key.indexOf(prefixString) === 0;
  }

  function createClient(opts) {
    opts = opts || {};
    var fetchFn = opts.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fetchFn) {
      fetchFn = function () {
        return Promise.reject(new Error("no fetch implementation available"));
      };
    }
    var setIntervalFn = opts.setInterval || setInterval;
    var clearIntervalFn = opts.clearInterval || clearInterval;
    var fetchTimeout =
      typeof opts.fetchTimeout === "number" ? opts.fetchTimeout : 15000;

    var observers = Object.create(null); // key -> Set<fn>
    var refreshTimers = Object.create(null);
    var optionsByKey = Object.create(null); // key -> latest cfg from query()
    var manualStatus = Object.create(null); // key -> facade status override

    var client = new Core.QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 0,
          // Keep finished queries until removeAll/clear explicitly drops them.
          gcTime: Infinity,
          refetchOnWindowFocus: false,
          retryOnMount: false,
          networkMode: "always",
        },
      },
    });

    function getQueryRecord(queryKey) {
      return client.getQueryCache().find({ queryKey: queryKey });
    }

    /* Snapshot handed to observers; mirrors the previous record shape. */
    function snapshotOf(key) {
      var q = getQueryRecord(toQueryKey(key));
      var s = q ? q.state : null;
      var status = "idle";

      if (manualStatus[key]) {
        status = manualStatus[key];
      } else if (s && s.status === "pending") {
        status = s.fetchStatus === "fetching" ? "loading" : "idle";
      } else if (s && s.status === "error") {
        status = "error";
      } else if (s && s.status === "success") {
        if (s.fetchStatus === "fetching") status = "refreshing";
        else if (s.data === undefined || s.data === null) status = "empty";
        else if (s.isInvalidated) status = "stale";
        else status = "success";
      }
      return {
        key: key,
        status: status,
        data: s ? s.data : undefined,
        error: s && s.error ? s.error : undefined,
        fetching: !!s && s.fetchStatus === "fetching",
        updatedAt: s ? s.dataUpdatedAt || 0 : 0,
      };
    }

    /* Notify exact observers of `key`, then each enclosing prefix observer. */
    function emit(key) {
      var set = observers[key];
      if (set && set.size) {
        set.forEach(function (fn) {
          try {
            fn(snapshotOf(key));
          } catch (e) {
            /* observer isolation */
          }
        });
      }
      var parts = key.split(":");
      var prefix = "";
      for (var i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? prefix + ":" + parts[i] : parts[i];
        var pset = observers[prefix];
        if (pset && pset.size) {
          pset.forEach(function (fn) {
            try {
              fn(snapshotOf(key));
            } catch (e2) {
              /* observer isolation */
            }
          });
        }
      }
    }

    function resolveRetry(cfg) {
      var allow = cfg.retry;
      var retries;
      if (allow === false) retries = 0;
      else if (allow === undefined || allow === true) retries = 2;
      else retries = allow;
      var base = typeof cfg.retryBaseMs === "number" ? cfg.retryBaseMs : 500;
      var max = typeof cfg.retryMaxMs === "number" ? cfg.retryMaxMs : 8000;
      return {
        retry: retries > 0 ? retries : false,
        retryDelay: function (failureCount) {
          return scheduleRetry(failureCount - 1, base, max);
        },
      };
    }

    function buildQueryFn(key, cfg) {
      var fetcher = cfg.fetcher || opts.fetcher || null;
      if (typeof fetcher !== "function") {
        var url = cfg.fetchUrl;
        if (url) {
          fetcher = function () {
            return fetchFn(url, {
              signal: arguments[0] && arguments[0].signal,
            }).then(function (r) {
              if (!r.ok) throw new Error("HTTP " + r.status);
              return r.json();
            });
          };
        } else {
          fetcher = function () {
            return Promise.reject(
              new Error("no fetcher configured for " + key),
            );
          };
        }
      }
      var timeoutMs =
        typeof cfg.fetchTimeout === "number" ? cfg.fetchTimeout : fetchTimeout;
      return function (ctx) {
        var ctxSignal = ctx && ctx.signal ? ctx.signal : undefined;
        var timer = null;
        var controller = null;
        var signal = ctxSignal;
        if (timeoutMs > 0 && typeof AbortController !== "undefined") {
          controller = new AbortController();
          signal = controller.signal;
          if (ctxSignal && ctxSignal.aborted) controller.abort();
          else if (ctxSignal)
            ctxSignal.addEventListener(
              "abort",
              function () {
                controller.abort();
              },
              { once: true },
            );
          timer = setTimeout(function () {
            controller.abort();
          }, timeoutMs);
        }
        // Call the fetcher synchronously (matches the previous facade behaviour:
        // the query backing a key is 'loading' the moment query() returns).
        var out;
        try {
          out = fetcher(key, {
            signal: signal,
            options: cfg.options || {},
            cfg: cfg,
          });
        } catch (err) {
          if (timer) clearTimeout(timer);
          return Promise.reject(err);
        }
        if (out && typeof out.then === "function") {
          return out.then(
            function (data) {
              if (timer) clearTimeout(timer);
              return data;
            },
            function (err) {
              if (timer) clearTimeout(timer);
              throw err;
            },
          );
        }
        if (timer) clearTimeout(timer);
        return Promise.resolve(out);
      };
    }

    /* Start a fetch for `key` (query-core deduplicates shared in-flight work). */
    function runFetch(key, cfg) {
      var queryKey = toQueryKey(key);
      var q = getQueryRecord(queryKey);
      if (q && q.state.fetchStatus === "fetching") return; // already in flight

      var fetchOpts = {
        queryKey: queryKey,
        queryFn: buildQueryFn(key, cfg),
      };
      var retryCfg = resolveRetry(cfg);
      fetchOpts.retry = retryCfg.retry;
      fetchOpts.retryDelay = retryCfg.retryDelay;

      // fetchQuery sets the query to pending/fetching synchronously; notify
      // observers of the loading/refreshing transition in the same tick.
      client.fetchQuery(fetchOpts).then(
        function () {
          emit(key);
        },
        function () {
          emit(key);
        },
      );
      emit(key);
    }

    /* Ensure record exists and (optionally) fetch. Returns a snapshot. */
    function query(key, cfg) {
      cfg = cfg || {};
      optionsByKey[key] = cfg;
      var queryKey = toQueryKey(key);
      var q = getQueryRecord(queryKey);
      var hasData = !!q && q.state.data !== undefined;
      var fetching = !!q && q.state.fetchStatus === "fetching";

      var shouldFetch = !hasData && !fetching;
      var refreshOnMount = hasData && !fetching && !!cfg.refreshOnMount;
      if (shouldFetch || refreshOnMount) {
        runFetch(key, cfg);
      }
      if (cfg.refetchInterval) ensureRefreshTimer(key, cfg);
      return snapshotOf(key);
    }

    function ensureRefreshTimer(key, cfg) {
      if (refreshTimers[key]) return;
      refreshTimers[key] = setIntervalFn(function () {
        if (typeof document !== "undefined" && document.hidden) return;
        var rr = getQueryRecord(toQueryKey(key));
        if (!rr) return;
        if (rr.state.fetchStatus !== "fetching") {
          runFetch(key, cfg);
        }
      }, cfg.refetchInterval);
    }

    /* Ensure a query record exists without fetching. */
    function ensure(key) {
      if (!getQueryRecord(toQueryKey(key))) {
        client.setQueryData(toQueryKey(key), undefined);
      }
      return getQuery(key);
    }

    function get(key) {
      var q = getQueryRecord(toQueryKey(key));
      return q ? q.state.data : undefined;
    }

    function getQuery(key) {
      var q = getQueryRecord(toQueryKey(key));
      return q ? snapshotOf(key) : null;
    }

    /* Write data directly into the cache (e.g. from a realtime event). This is
       authoritative: any in-flight request for this key is cancelled first so a
       stale response cannot overwrite the newer write (put-supersedes). */
    function put(key, data, status) {
      var queryKey = toQueryKey(key);
      var q = getQueryRecord(queryKey);
      if (q && q.state.fetchStatus === "fetching") {
        client
          .cancelQueries({ queryKey: queryKey, exact: true })
          .catch(function () {
            /* cancelled */
          });
      }
      client.setQueryData(queryKey, data);
      if (status) {
        manualStatus[key] = status;
      } else {
        delete manualStatus[key];
      }
      emit(key);
      return snapshotOf(key);
    }

    function setData(key, updater) {
      var queryKey = toQueryKey(key);
      var q = getQueryRecord(queryKey);
      if (q && q.state.fetchStatus === "fetching") {
        client
          .cancelQueries({ queryKey: queryKey, exact: true })
          .catch(function () {});
      }
      var prev = client.getQueryData(queryKey);
      var next = typeof updater === "function" ? updater(prev) : updater;
      client.setQueryData(queryKey, next);
      delete manualStatus[key];
      emit(key);
      return snapshotOf(key);
    }

    /* Manual status override used by companion modules (e.g. mutations). */
    function setStatus(key, status, extra) {
      var queryKey = toQueryKey(key);
      var q = getQueryRecord(queryKey);
      if (!q) {
        client.setQueryData(queryKey, undefined);
        q = getQueryRecord(queryKey);
      }
      if (status === "loading") {
        // Derived fetch state takes over; surface as loading-ish.
        q.setState({
          data: q.state.data,
          status: "pending",
          fetchStatus: "fetching",
        });
        delete manualStatus[key];
      } else if (status === "error") {
        q.setState({
          data: q.state.data,
          status: "error",
          fetchStatus: "idle",
          error: (extra && extra.error) || new Error("unknown error"),
        });
        delete manualStatus[key];
      } else if (status === undefined || status === "success") {
        delete manualStatus[key];
      } else {
        manualStatus[key] = status;
      }
      emit(key);
      return snapshotOf(key);
    }

    /* Subscribe to a key or prefix. Fires immediately with current snapshot. */
    function observe(key, fn) {
      (observers[key] || (observers[key] = new Set())).add(fn);
      try {
        fn(snapshotOf(key));
      } catch (e) {
        /* observer isolation */
      }
      return function () {
        var set = observers[key];
        if (set) {
          set.delete(fn);
          if (!set.size) delete observers[key];
        }
      };
    }

    function cacheKeys() {
      return (client.getQueryCache().getAll() || []).map(function (q) {
        return q.queryKey.join(":");
      });
    }

    function matchingKeys(keyOrPrefix) {
      return cacheKeys().filter(function (k) {
        return matchesPrefix(k, keyOrPrefix);
      });
    }

    function isObserved(key) {
      if (observers[key] && observers[key].size) return true;
      var parts = key.split(":");
      var prefix = "";
      for (var i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? prefix + ":" + parts[i] : parts[i];
        if (observers[prefix] && observers[prefix].size) return true;
      }
      return false;
    }

    /* Invalidate by exact key or prefix; observed keys refetch, others stale. */
    function invalidate(keyOrPrefix) {
      var matched = matchingKeys(keyOrPrefix);
      matched.forEach(function (k) {
        var queryKey = toQueryKey(k);
        var q = getQueryRecord(queryKey);
        if (!q) return;
        if (isObserved(k)) {
          if (q.state.fetchStatus !== "fetching") {
            q.setState({
              data: q.state.data,
              isInvalidated: true,
              status: q.state.status,
              fetchStatus: q.state.fetchStatus,
            });
            client
              .refetchQueries({
                queryKey: queryKey,
                exact: true,
                refetchType: "all",
              })
              .catch(function () {});
          }
        } else {
          q.setState({
            data: q.state.data,
            isInvalidated: true,
            status: q.state.status,
            fetchStatus: q.state.fetchStatus,
          });
        }
        emit(k);
      });
      return matched.length;
    }

    function invalidatePrefix(prefix) {
      return invalidate(prefix);
    }

    function removeAll(prefix) {
      matchingKeys(prefix).forEach(function (k) {
        var queryKey = toQueryKey(k);
        var q = getQueryRecord(queryKey);
        if (q && q.state.fetchStatus === "fetching") {
          client
            .cancelQueries({ queryKey: queryKey, exact: true })
            .catch(function () {});
        }
        client.removeQueries({ queryKey: queryKey, exact: true });
        delete manualStatus[k];
        delete optionsByKey[k];
        if (refreshTimers[k]) {
          clearIntervalFn(refreshTimers[k]);
          delete refreshTimers[k];
        }
      });
      Object.keys(observers)
        .filter(function (k) {
          return matchesPrefix(k, prefix);
        })
        .forEach(function (k) {
          delete observers[k];
        });
    }

    /* Mutation lifecycle helper. */
    function mutate(key) {
      ensure(key);
      return {
        setStatus: function (status, extra) {
          setStatus(key, status, extra);
        },
        setData: function (updater) {
          setData(key, updater);
        },
        invalidate: function () {
          invalidate(key);
        },
      };
    }

    function clear() {
      try {
        client.clear();
      } catch (e) {
        /* noop */
      }
      for (var k in manualStatus) delete manualStatus[k];
      for (var k2 in optionsByKey) delete optionsByKey[k2];
      Object.keys(refreshTimers).forEach(function (k) {
        clearIntervalFn(refreshTimers[k]);
      });
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
        var q = getQueryRecord(toQueryKey(key));
        return (
          !!q &&
          q.state.status === "pending" &&
          q.state.fetchStatus === "fetching"
        );
      },
    };
  }

  return {
    createClient: createClient,
    QUERY_STATES: QUERY_STATES,
    scheduleRetry: scheduleRetry,
  };
});
