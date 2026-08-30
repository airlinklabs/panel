/* Shared realtime socket client.
 *
 * One WebSocket to the panel's `/ws/realtime`, used by every page. Handles:
 *   - automatic (backoff) reconnect without duplicate sockets
 *   - heartbeat: answers the panel's `ping` with `pong`
 *   - cursor-based resync: after (re)connecting, asks the server for every
 *     event newer than the last one this client saw (persisted in storage)
 *   - online/offline and page-visibility awareness
 *   - fan-out of every decoded event to registered handlers
 *
 * The transport itself is driven by `reconnecting-websocket` (vendored at
 * /javascript/vendor/reconnecting-websocket.js, exposed as the global
 * ReconnectingWebSocket). That library owns the connection pool, backoff
 * schedule and socket lifecycle; this file owns the panel protocol on top of
 * it: hello/sync cursor, ping/pong, watch commands, and the public event API
 * consumed by pages ("one authoritative socket, many subscribers").
 *
 * The WebSocket ctor is injected so reconnect/backoff/resync behaviour is
 * unit-testable in Node.
 *
 * Exposed surfaces:
 *   window.ALRealtimeClient.client(opts)
 *   module.exports (Node tests)
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== "undefined") window.ALRealtimeClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var VERSION = 1;
  var DEFAULT_PATH = "/ws/realtime";
  var SEQ_KEY = "__al_realtime_seq";
  var MAX_RETRY_MS = 15_000;
  var MAX_ATTEMPTS = 12;

  function backoffDelay(attempt) {
    var jitter = 0.6 + Math.random() * 0.4;
    return Math.min(MAX_RETRY_MS, 1000 * Math.pow(1.3, attempt)) * jitter;
  }

  function buildUrl(opts) {
    if (opts.url) {
      if (/^wss?:\/\//i.test(opts.url)) return opts.url;
      var scheme2 = opts.url.includes("://") ? opts.url.split("://")[0] : "ws";
      return scheme2 + "://" + opts.url + DEFAULT_PATH;
    }
    var scheme =
      opts.secure !== undefined ||
      (typeof window !== "undefined" && window.location.protocol === "https:")
        ? "wss:"
        : "ws:";
    var host =
      typeof window !== "undefined" ? window.location.host : "localhost";
    return scheme + "//" + host + DEFAULT_PATH;
  }

  function readSeq(storage) {
    if (!storage) return null;
    var raw;
    try {
      raw = storage.getItem(SEQ_KEY);
    } catch (e) {
      return null;
    }
    var n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function writeSeq(storage, seq) {
    if (!storage || seq == null) return;
    try {
      storage.setItem(SEQ_KEY, String(seq));
    } catch (e) {
      /* storage unavailable */
    }
  }

  /* Resolve the reconnecting-websocket class. In the browser it is vendored
     (window.ReconnectingWebSocket); in Node tests it is required directly. */
  function resolveRWS(opts) {
    if (opts.ReconnectingWebSocket) return opts.ReconnectingWebSocket;
    if (typeof window !== "undefined" && window.ReconnectingWebSocket)
      return window.ReconnectingWebSocket;
    try {
      // InteropImport: @ts-ignore
      return require("reconnecting-websocket");
    } catch (e) {
      /* not installed in this environment */
    }
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var url = buildUrl(opts);
    var storage = opts.storage || null;
    var onMessage = opts.onMessage; // (event) => void
    var onEvent = opts.onEvent || onMessage || function () {};
    var RWS = resolveRWS(opts);
    var WS =
      opts.WebSocket ||
      (typeof window !== "undefined" ? window.WebSocket : undefined);

    if (!RWS) {
      return {
        status: function () {
          return "unsupported";
        },
        subscribe: function () {
          return function () {};
        },
        onStatusChange: function () {
          return function () {};
        },
        send: function () {
          return false;
        },
        watch: function () {
          return false;
        },
        unwatch: function () {
          return false;
        },
        watchEvents: function () {
          return false;
        },
        unwatchEvents: function () {
          return false;
        },
        watchAll: function () {
          return false;
        },
        reconnect: function () {},
        disconnect: function () {},
        lastSeq: function () {
          return 0;
        },
      };
    }

    var status = "disconnected";
    var socket = null;
    var stopped = false;
    var paused = false;
    var lastSeq = readSeq(storage);
    var handlers = (opts.handlers || []).slice();
    var statusListeners = [];

    function setStatus(next) {
      if (status === next) return;
      var prev = status;
      status = next;
      for (var i = 0; i < statusListeners.length; i++) {
        try {
          statusListeners[i](status, prev);
        } catch (e) {
          /* listener isolation */
        }
      }
    }

    function dispatch(evt) {
      for (var i = 0; i < handlers.length; i++) {
        try {
          handlers[i](evt);
        } catch (e) {
          /* handler isolation */
        }
      }
    }

    function makeRWS() {
      // reconnecting-websocket takes (url, protocols, options). Passing the
      // app's WebSocket lets tests inject the mock; browsers get the real one.
      var rwsOpts = {
        connectionTimeout: 4000,
        minReconnectionDelay: 1000,
        maxReconnectionDelay: MAX_RETRY_MS,
        maxRetries: MAX_ATTEMPTS,
        startClosed: stopped,
      };
      if (WS) rwsOpts.WebSocket = WS;
      try {
        var r = new RWS(url, [], rwsOpts);
        return r;
      } catch (e) {
        return null;
      }
    }

    function connectSocket() {
      if (stopped || paused) return;
      if (socket) return; // rws owns reconnects, keep exactly one instance

      var rws = makeRWS();
      if (!rws) {
        setStatus("unsupported");
        return;
      }
      socket = rws;
      setStatus("connecting");

      rws.addEventListener("open", function () {
        try {
          rws.send(JSON.stringify({ type: "sync", sinceSeq: lastSeq }));
        } catch (e) {
          /* transport not ready */
        }
      });

      rws.addEventListener("message", function (evt) {
        var parsed;
        try {
          parsed = JSON.parse(evt.data);
        } catch (e) {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;

        if (parsed.type === "ping") {
          try {
            rws.send(JSON.stringify({ type: "pong" }));
          } catch (e) {}
          return;
        }

        if (
          parsed.type === "realtime.ready" ||
          parsed.type === "realtime.synced"
        ) {
          if (typeof parsed.seq === "number" && parsed.seq > (lastSeq || 0)) {
            lastSeq = parsed.seq;
            writeSeq(storage, lastSeq);
          }
          setStatus("connected");
          if (typeof onEvent === "function") {
            try {
              onEvent(parsed);
            } catch (e) {
              /* onEvent isolation */
            }
          }
          return;
        }

        if (typeof parsed.seq === "number" && parsed.seq > (lastSeq || 0)) {
          lastSeq = parsed.seq;
          writeSeq(storage, lastSeq);
        }
        dispatch(parsed);
      });

      rws.addEventListener("close", function () {
        // rws keeps its single instance and owns the reconnect; the socket
        // reference must stay live so `disconnect()`/`reconnect()`/`send()`
        // keep targeting the same transport.
        if (stopped) {
          setStatus("disconnected");
          return;
        }
        if (paused) return;
        setStatus("reconnecting"); // rws is already backoff-scheduling
      });

      rws.addEventListener("error", function () {
        // A dead socket surfaces as 'close'; nothing else to do here.
      });
    }

    function wake() {
      paused = false;
      if (stopped) return;
      if (!socket) {
        connectSocket();
        return;
      }
      try {
        socket.reconnect();
      } catch (e) {
        /* a closed rws reconnects on its own */
      }
    }

    function pause() {
      paused = true;
      if (socket) {
        try {
          socket.close(4001);
        } catch (e) {
          /* already closed */
        }
      }
    }

    // Browser wiring.
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("online", function () {
        wake();
      });
      window.addEventListener("offline", function () {
        if (!socket) setStatus("reconnecting");
      });
    }
    if (
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function"
    ) {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) pause();
        else wake();
      });
    }

    var client = {
      subscribe: function (fn) {
        handlers.push(fn);
        return function () {
          handlers = handlers.filter(function (h) {
            return h !== fn;
          });
        };
      },
      onStatusChange: function (fn) {
        statusListeners.push(fn);
        return function () {
          statusListeners = statusListeners.filter(function (h) {
            return h !== fn;
          });
        };
      },
      send: function (obj) {
        if (!socket) return false;
        try {
          socket.send(JSON.stringify(obj));
          return true;
        } catch (e) {
          return false;
        }
      },
      watch: function (serverId) {
        return this.send({ type: "watch", serverId: serverId });
      },
      unwatch: function (serverId) {
        return this.send({ type: "unwatch", serverId: serverId });
      },
      watchEvents: function (serverId) {
        return this.send({ type: "watchEvents", serverId: serverId });
      },
      unwatchEvents: function (serverId) {
        return this.send({ type: "unwatchEvents", serverId: serverId });
      },
      watchAll: function () {
        return this.send({ type: "watchAll" });
      },
      disconnect: function () {
        stopped = true;
        if (socket) {
          try {
            socket.close(1000);
          } catch (e) {
            /* already closed */
          }
          socket = null;
        }
        setStatus("disconnected");
      },
      reconnect: function () {
        stopped = false;
        wake();
      },
      status: function () {
        return status;
      },
      lastSeq: function () {
        return lastSeq;
      },
    };

    if (opts.autostart !== false) {
      // One socket, kept across navigation. Turbo keeps window alive, so this
      // instance survives page swaps; a full reload creates a fresh one that
      // resyncs from the persisted cursor.
      connectSocket();
    }
    return client;
  }

  return {
    create: create,
    createClient: create,
    VERSION: VERSION,
    SEQ_KEY: SEQ_KEY,
    backoffDelay: backoffDelay,
    buildUrl: buildUrl,
  };
});
