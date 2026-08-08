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
 * Dependencies are injected (WebSocket ctor, storage, url) so reconnect /
 * backoff / resync behaviour is unit-testable in Node.
 *
 * Exposed surfaces:
 *   window.ALRealtimeClient.client(opts)
 *   module.exports (Node tests)
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') window.ALRealtimeClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = 1;
  var DEFAULT_PATH = '/ws/realtime';
  var SEQ_KEY = '__al_realtime_seq';
  var BASE_RETRY_MS = 500;
  var MAX_RETRY_MS = 15_000;
  var MAX_ATTEMPTS = 12;
  var HEARTBEAT_TIMEOUT_MS = 15_000;

  function backoffDelay(attempt) {
    var jitter = 0.6 + Math.random() * 0.4;
    return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * Math.pow(2, attempt)) * jitter;
  }

  function buildUrl(opts) {
    if (opts.url) {
      if (/^wss?:\/\//i.test(opts.url)) return opts.url;
      var scheme2 = opts.url.includes('://') ? opts.url.split('://')[0] : 'ws';
      return scheme2 + '://' + opts.url + DEFAULT_PATH;
    }
    var scheme = opts.secure !== undefined || (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'wss:' : 'ws:';
    var host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    return scheme + '//' + host + DEFAULT_PATH;
  }

  function readSeq(storage) {
    if (!storage) return null;
    var raw;
    try { raw = storage.getItem(SEQ_KEY); } catch (e) { return null; }
    var n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function writeSeq(storage, seq) {
    if (!storage || seq == null) return;
    try { storage.setItem(SEQ_KEY, String(seq)); } catch (e) { /* storage unavailable */ }
  }

  function create(opts) {
    opts = opts || {};
    var url = buildUrl(opts);
    var storage = opts.storage || null;
    var WS = opts.WebSocket || (typeof window !== 'undefined' ? window.WebSocket : (typeof WebSocket !== 'undefined' ? WebSocket : null));
    var now = opts.now || function () { return Date.now(); };
    var onMessage = opts.onMessage;       // (event) => void
    var onEvent = opts.onEvent || onMessage || function () {};

    if (!WS) {
      return {
        status: function () { return 'unsupported'; },
        subscribe: function () { return noopFn; },
        onStatusChange: function () { return noopFn; },
        send: function () { return false; },
        watch: function () { return false; },
        unwatch: function () { return false; },
        watchEvents: function () { return false; },
        unwatchEvents: function () { return false; },
        watchAll: function () { return false; },
        reconnect: function () {},
        disconnect: function () {},
        lastSeq: function () { return 0; },
      };
    }

    var noopFn = function () {};
    var status = 'disconnected';
    var socket = null;
    var attempt = 0;
    var reconnectTimer = null;
    var killTimer = null;
    var stopped = false;
    var paused = false;
    var lastSeq = readSeq(storage);
    var handlers = (opts.handlers || []).slice();
    var statusListeners = [];

    function setStatus(next) {
      if (status === next) return;
      status = next;
      for (var i = 0; i < statusListeners.length; i++) {
        try { statusListeners[i](status); } catch (e) { /* listener isolation */ }
      }
    }

    function dispatch(evt) {
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](evt); } catch (e) { /* handler isolation */ }
      }
    }

    function send(obj) {
      if (!socket || socket.readyState !== 1) return false;
      try {
        socket.send(JSON.stringify(obj));
        return true;
      } catch (e) {
        return false;
      }
    }

    function closeSocket() {
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
      if (socket) {
        try { socket.close(); } catch (e) { /* already closed */ }
        socket = null;
      }
    }

    function scheduleReconnect(immediate) {
      if (stopped || paused) return;
      attempt += 1;
      if (attempt > MAX_ATTEMPTS) {
        // Give up active reconnecting but keep listeners informed; once the
        // browser wakes up (visibility/online) it will retry.
        setStatus('reconnecting');
        return;
      }
      var delay = immediate ? 10 : backoffDelay(attempt - 1);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setStatus('reconnecting');
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connectSocket();
      }, delay);
    }

    function connectSocket() {
      if (stopped || paused) return;
      if (socket && socket.readyState === 1) return;

      var ws;
      try {
        ws = new WS(url);
      } catch (e) {
        scheduleReconnect(true);
        return;
      }
      socket = ws;
      setStatus('connecting');

      ws.onopen = function () {
        attempt = 0;
        ws.send(JSON.stringify({ type: 'sync', sinceSeq: lastSeq }));
      };

      ws.onmessage = function (evt) {
        var parsed;
        try {
          parsed = JSON.parse(evt.data);
        } catch (e) {
          return;
        }
        if (!parsed || typeof parsed !== 'object') return;

        if (parsed.type === 'ping') {
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
          return;
        }

        if (parsed.type === 'realtime.ready' || parsed.type === 'realtime.synced') {
          if (typeof parsed.seq === 'number' && parsed.seq > (lastSeq || 0)) {
            lastSeq = parsed.seq;
            writeSeq(storage, lastSeq);
          }
          setStatus('connected');
          if (typeof onEvent === 'function') {
            try { onEvent(parsed); } catch (e) { /* onEvent isolation */ }
          }
          return;
        }

        if (typeof parsed.seq === 'number' && parsed.seq > (lastSeq || 0)) {
          lastSeq = parsed.seq;
          writeSeq(storage, lastSeq);
        }
        dispatch(parsed);
      };

      ws.onclose = function () {
        if (socket === ws) socket = null;
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        if (stopped) {
          setStatus('disconnected');
          return;
        }
        if (paused) return;
        scheduleReconnect();
      };

      ws.onerror = function () {
        // A dead socket surfaces as onclose; force a close if it did not.
        try { if (ws && ws.readyState !== 1) ws.close(); } catch (e) {}
      };

      killTimer = setTimeout(killTimedOut, HEARTBEAT_TIMEOUT_MS);
    }

    function killTimedOut() {
      // If no `realtime.ready`/`realtime.synced` arrived in time the socket is
      // unresponsive — close it to trigger the reconnect path.
      if (!socket) return;
      try { socket.close(); } catch (e) {}
    }

    function wake() {
      paused = false;
      if (stopped) return;
      if (!socket || socket.readyState !== 1) {
        scheduleReconnect(true);
      }
    }

    function pause() {
      paused = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }

    // Browser wiring.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () { wake(); });
      window.addEventListener('offline', function () {
        if (!socket || socket.readyState !== 1) setStatus('reconnecting');
      });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pause();
        else wake();
      });
    }

    var client = {
      subscribe: function (fn) { handlers.push(fn); return function () { handlers = handlers.filter(function (h) { return h !== fn; }); }; },
      onStatusChange: function (fn) { statusListeners.push(fn); return function () { statusListeners = statusListeners.filter(function (h) { return h !== fn; }); }; },
      send: send,
      watch: function (serverId) { return send({ type: 'watch', serverId: serverId }); },
      unwatch: function (serverId) { return send({ type: 'unwatch', serverId: serverId }); },
      watchEvents: function (serverId) { return send({ type: 'watchEvents', serverId: serverId }); },
      unwatchEvents: function (serverId) { return send({ type: 'unwatchEvents', serverId: serverId }); },
      watchAll: function () { return send({ type: 'watchAll' }); },
      disconnect: function () {
        stopped = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        closeSocket();
        setStatus('disconnected');
      },
      reconnect: function () {
        stopped = false;
        wake();
      },
      status: function () { return status; },
      lastSeq: function () { return lastSeq; },
    };

    if (opts.autostart !== false) {
      // Connect on construction; navigation between pages keeps this one socket.
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