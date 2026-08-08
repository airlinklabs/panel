import { WebSocket } from 'ws';
import logger from '../logger';
import { daemonScheme } from '../utils/core/daemonRequest';
import { emitRealtime, serverEvent } from './events';

// ── Per-server daemon event watcher ──────────────────────────────────────────
// The daemon streams container lifecycle events on `/containerevents/:id`
// (pulling, creating, starting, stopped, installing, installed, error). Unlike
// `/containerstatus/:id`, these are push-only: they arrive when something
// actually happens, so no polling is involved.
//
// Same reference-counting pattern as serverStatusWatcher: the panel holds ONE
// connection per watched server and fans events out over the realtime bus.
// The browser never opens `/events/:id` directly — it subscribes to the
// `server.lifecycle.changed` bus event instead.

export interface WatchHandle {
  release(): void;
}

interface WatcherState {
  refs: number;
  socket: WebSocket | null;
  connecting: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  node: { address: string; port: number; key: string };
}

const watchers = new Map<string, WatcherState>();

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 15_000;
const MAX_RETRY_ATTEMPTS = 8;

async function daemonWsScheme(): Promise<'wss' | 'ws'> {
  return (await daemonScheme()) === 'https' ? 'wss' : 'ws';
}

function socketPath(state: WatcherState, serverId: string, port: number, scheme: 'wss' | 'ws'): string {
  const { address } = state.node;
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `${scheme}://${host}:${port}/containerevents/${encodeURIComponent(serverId)}`;
}

function openSocket(state: WatcherState, serverId: string): void {
  if (state.connecting || (state.socket && state.socket.readyState === WebSocket.OPEN)) return;

  state.connecting = true;
  daemonWsScheme().then((scheme) => {
    const url = socketPath(state, serverId, state.node.port, scheme);
    const socket = new WebSocket(url, { handshakeTimeout: 8_000 });
    state.socket = socket;

    const authTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN && !(state as WatcherState & { authed?: boolean }).authed) {
        logger.debug(`event watcher auth timeout for ${serverId}`);
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

      if (msg.event === 'lifecycle' && msg.data && typeof msg.data === 'object') {
        const data = msg.data as { type?: string; message?: string };
        if (typeof data.type === 'string') {
          emitRealtime(
            serverEvent('server.lifecycle.changed', serverId, {
              state: { type: data.type, message: data.message ?? null },
            }),
          );
        }
      } else if (msg.event === 'error') {
        logger.warn(`event watcher error for ${serverId}:`, { data: msg.data });
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
    logger.warn(`Event watcher gave up reconnecting to daemon for ${serverId}`);
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
 * Begin watching a server's daemon lifecycle events. Returns a handle; call
 * `release()` when the caller no longer needs events. Multiple watchers share
 * one underlying daemon connection.
 */
export function watchServerEvents(
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
  };
}