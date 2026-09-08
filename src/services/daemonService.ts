/**
 * Daemon service — centralized daemon HTTP communication.
 * Replaces scattered fetch() calls across V2 route handlers.
 */

import prisma from "../db";
import { daemonScheme } from "../handlers/utils/core/daemonRequest";
import { DEFAULT_DAEMON_TIMEOUT_MS } from "../config/timeouts";

interface DaemonRequestOpts {
  method?: string;
  body?: unknown;
  timeout?: number;
}

/** Thrown when the target node cannot be found in the database. */
export class DaemonNodeNotFoundError extends Error {
  constructor(message = "Node not found") {
    super(message);
    this.name = "DaemonNodeNotFoundError";
  }
}

function getProtocol(): string {
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/**
 * Resolve daemon protocol using the enforceDaemonHttps setting.
 * Falls back to getProtocol() if the setting cannot be loaded.
 */
async function resolveProtocol(): Promise<string> {
  try {
    return await daemonScheme();
  } catch {
    return getProtocol();
  }
}

/**
 * Core daemon fetch — makes a request to a specific node.
 */
async function fetchDaemon(
  node: { address: string; port: number; key: string },
  path: string,
  opts?: DaemonRequestOpts,
): Promise<Response> {
  const protocol = await resolveProtocol();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${node.key}`,
  };
  if (opts?.body !== null && opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${protocol}://${node.address}:${node.port}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body:
      opts?.body !== null && opts?.body !== undefined
        ? JSON.stringify(opts.body)
        : undefined,
    signal: AbortSignal.timeout(opts?.timeout ?? DEFAULT_DAEMON_TIMEOUT_MS),
  });
}

/**
 * Make a request to a node's daemon via server UUID.
 * Resolves server → node, constructs URL with proper protocol, handles auth + timeout.
 * Throws DaemonNodeNotFoundError if the node cannot be found.
 */
export async function daemonRequest(
  serverUUID: string,
  path: string,
  opts?: DaemonRequestOpts,
): Promise<Response> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
  });
  if (!server) {
    throw new Error("Server not found");
  }
  const node = await prisma.node.findUnique({ where: { id: server.nodeId } });
  if (!node) {
    throw new DaemonNodeNotFoundError();
  }
  return fetchDaemon(node, path, opts);
}

/**
 * Make a request to a node's daemon via explicit node ID.
 * Used when the target node differs from the server's node (e.g. database hosts).
 * Throws DaemonNodeNotFoundError if the node cannot be found.
 */
export async function daemonRequestByNode(
  nodeId: number,
  path: string,
  opts?: DaemonRequestOpts,
): Promise<Response> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) {
    throw new DaemonNodeNotFoundError();
  }
  return fetchDaemon(node, path, opts);
}

/**
 * Make a request to a daemon at a direct address (no DB lookup).
 * Used for connectivity tests where the node isn't in the database yet.
 */
export async function daemonRequestDirect(
  address: string,
  port: number,
  key: string,
  path: string,
  opts?: DaemonRequestOpts,
): Promise<Response> {
  return fetchDaemon({ address, port, key }, path, opts);
}
