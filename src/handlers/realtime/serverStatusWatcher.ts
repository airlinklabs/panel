import { WebSocket } from 'ws';
import logger from '../logger';
import { daemonScheme } from '../utils/core/daemonRequest';
import { emitRealtime } from './events';

// ── Per-server daemon status watcher ──────────────────────────────────────────
// The daemon already streams `state` + `stats` on a single `/containerstatus`
// WebSocket. Rather than every browser opening its own connection (or every
// dashboard poll hitting the daemon), the panel opens ONE connection per
// watched server and fans the results out over the realtime bus. Watchers are
// reference-counted: the first subscriber creates the connection, the last
// release destroys it.
//
// The daemon is authoritative here. The panel only relays what the daemon
// says — it never invents a running/stopped state.

export interface WatchHandle {
  release(): void;
  /** Current cached status, if the daemon has reported one. */
  snapshot(): { status?: unknown; stats?: unknown } | null;
}

interface WatcherState {
  refs: number;
  socket: WebSocket | null;
  connecting: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  status: unknown;
  stats: unknown;
  node: { address: string; port: number; key: string };
}

const watchers = new Map<string, WatcherState>();

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 15_000;
const MAX_RETRY_ATTEMPTS = 8;

async function daemonWsUrl(port: number): Promise<`wss://${string}` | `ws://${string}`> {
  const scheme = await daemonScheme();
  return scheme === 'https' ? 'wss://' : 'ws://';
}

function socketPath(state: WatcherState, serverId: string, port: number, scheme: 'wss' | 'ws'): string {
  const { address } = state.node;
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `${scheme}://${host}:${port}/containerstatus/${encodeURIComponent(serverId)}`;
}

function openSocket(state: WatcherState, serverId: string): void {
  if (state.connecting || (state.socket && state.socket.readyState === WebSocket.OPEN)) return;

  state.connecting = true;
  daemonWsUrl(state.node.port).then((scheme) => {
    const url = socketPath(state, serverId, state.node.port, scheme as 'wss' | 'ws');
    const socket = new WebSocket(url, { handshakeTimeout: 8_000 });
    state.socket = socket;

    const authTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN && !(state as WatcherState & { authed?: boolean }).authed) {
        logger.debug(`status watcher auth timeout for ${serverId}`);
        socket.close(1008, 'auth timeout');
      }
    }, 10_000);

    socket.on('open', () => {
      (state as WatcherState & { authed?: boolean }).authed = false;
      socket.send(JSON.stringify({ event: 'auth', args: [state.node.key] }));
      clearTimeout(authTimer);
    });

    socket.on('message', (raw) => {
      let msg: { event?: string; data?: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.event === 'state' && msg.data !== undefined) {
        state.status = msg.data;
        emitRealtime({
          type: 'server.status.changed',
          resource: { type: 'server', id: serverId },
          scope: { serverId },
          state: msg.data,
        });
      } else if (msg.event === 'stats' && msg.data !== undefined) {
        state.stats = msg.data;
        emitRealtime({
          type: 'server.stats.changed',
          resource: { type: 'server', id: serverId },
          scope: { serverId },
          state: msg.data,
        });
      } else if (msg.event === 'error') {
        logger.warn(`status watcher error for ${serverId}:`, { data: msg.data });
      }
    });

    socket.on('error', () => {
      clearTimeout(authTimer);
      state.socket = null;
      scheduleReconnect(state, serverId);
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      state.socket = null;
      scheduleReconnect(state, serverId);
    });
  }).catch(() => {
    state.connecting = false;
    scheduleReconnect(state, serverId);
  });
}

function scheduleReconnect(state: WatcherState, serverId: string): void {
  state.connecting = false;
  if (state.refs <= 0) return;

  if (state.reconnectAttempts >= MAX_RETRY_ATTEMPTS) {
    logger.warn(`Status watcher gave up reconnecting to daemon for ${serverId}`);
    return;
  }

  const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** state.reconnectAttempts);
  state.reconnectAttempts += 1;

  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    if (state.refs > 0) openSocket(state, serverId);
  }, delay);
}

function cleanup(serverId: string): void {
  const state = watchers.get(serverId);
  if (!state) return;
  if (state.refs > 0) return;

  watchers.delete(serverId);
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  if (state.socket) {
    try {
      state.socket.close(1000, 'no watchers');
    } catch {
      /* already closed */
    }
    state.socket = null;
  }
}

/**
 * Begin watching a server's daemon status. Returns a handle; call `release()`
 * when the caller no longer needs updates. Multiple watchers share one
 * underlying daemon connection.
 */
export function watchServerStatus(
  serverId: string,
  node: { address: string; port: number; key: string },
): WatchHandle {
  let state = watchers.get(serverId);
  if (!state) {
    state = {
      refs: 0,
      socket: null,
      connecting: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      status: undefined,
      stats: undefined,
      node,
    };
    watchers.set(serverId, state);
  }
  state.refs += 1;

  if (!state.socket && !state.connecting) {
    openSocket(state, serverId);
  }

  return {
    release() {
      state = watchers.get(serverId);
      if (!state) return;
      state.refs = Math.max(0, state.refs - 1);
      cleanup(serverId);
    },
    snapshot() {
      const s = watchers.get(serverId);
      if (!s) return null;
      const out: { status?: unknown; stats?: unknown } = {};
      if (s.status !== undefined) out.status = s.status;
      if (s.stats !== undefined) out.stats = s.stats;
      return Object.keys(out).length ? out : null;
    },
  };
}