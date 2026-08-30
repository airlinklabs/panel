/**
 * Node service — shared CRUD for node + allocation operations.
 * Used by the Alternative (Pterodactyl-compatible) API layer.
 */

import prisma from "../db";
import {
  withNodePortLock,
  getNodePortPool,
  syncNodeAllocations,
} from "../handlers/utils/server/allocations";

// ── Node CRUD ────────────────────────────────────────────────────────────────

/** List all nodes with server counts (no pagination — callers paginate themselves). */
export async function listNodes() {
  return prisma.node.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      port: true,
      ram: true,
      cpu: true,
      disk: true,
      sftpPort: true,
      createdAt: true,
      _count: {
        select: {
          servers: true,
        },
      },
    },
  });
}

/** Get a single node by id, including its servers. */
export async function getNode(id: number) {
  return prisma.node.findUnique({
    where: { id },
    include: {
      servers: {
        select: {
          id: true,
          UUID: true,
          name: true,
          Memory: true,
          Cpu: true,
          Storage: true,
        },
      },
    },
  });
}

/** Get a node with just the fields needed for the delete guard. */
export async function getNodeForDelete(id: number) {
  return prisma.node.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { servers: true } },
    },
  });
}

export interface CreateNodeInput {
  name: string;
  address?: string;
  port?: number;
  ram?: number;
  cpu?: number;
  disk?: number;
  key: string;
  sftpPort?: number;
}

/** Create a new node. */
export async function createNode(data: CreateNodeInput) {
  return prisma.node.create({
    data: {
      name: data.name,
      address: data.address ?? "127.0.0.1",
      port: data.port ?? 3001,
      ram: data.ram ?? 0,
      cpu: data.cpu ?? 0,
      disk: data.disk ?? 0,
      key: data.key,
      sftpPort: data.sftpPort ?? 3003,
    },
    select: {
      id: true,
      name: true,
      address: true,
      port: true,
      ram: true,
      cpu: true,
      disk: true,
      createdAt: true,
    },
  });
}

export interface UpdateNodeInput {
  name?: string;
  address?: string;
  port?: number;
  ram?: number;
  cpu?: number;
  disk?: number;
  key?: string;
  sftpPort?: number;
}

/** Partial-update a node. */
export async function updateNode(id: number, fields: UpdateNodeInput) {
  const data: Record<string, unknown> = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.address !== undefined) data.address = fields.address;
  if (fields.port !== undefined) data.port = fields.port;
  if (fields.ram !== undefined) data.ram = fields.ram;
  if (fields.cpu !== undefined) data.cpu = fields.cpu;
  if (fields.disk !== undefined) data.disk = fields.disk;
  if (fields.key !== undefined) data.key = fields.key;
  if (fields.sftpPort !== undefined) data.sftpPort = fields.sftpPort;

  return prisma.node.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      address: true,
      port: true,
      ram: true,
      cpu: true,
      disk: true,
      createdAt: true,
    },
  });
}

/**
 * Delete a node. Returns { deleted: true } on success.
 * Throws if node has assigned servers.
 */
export async function deleteNode(id: number) {
  const node = await getNodeForDelete(id);
  if (!node) throw new NodeError("Node not found", 404);
  if (node._count.servers > 0) {
    throw new NodeError("Cannot delete node with assigned servers", 409);
  }
  await prisma.node.delete({ where: { id } });
  return node;
}

// ── Allocation CRUD ──────────────────────────────────────────────────────────

const MIN_PORT_NUMBER = 1024;
const MAX_PORT_NUMBER = 65535;

/** List allocations for a node, including which server (if any) claims each. */
export async function listAllocations(nodeId: number) {
  return prisma.allocation.findMany({
    where: { nodeId },
    include: { server: { select: { UUID: true, name: true } } },
    orderBy: { port: "asc" },
  });
}

export interface CreateAllocationInput {
  ip?: string;
  port: number;
}

/** Create an allocation (port-lock safe). Returns the new allocation row. */
export async function createAllocation(
  nodeId: number,
  data: CreateAllocationInput,
) {
  const parsedPort = parseInt(String(data.port), 10);
  if (
    isNaN(parsedPort) ||
    parsedPort < MIN_PORT_NUMBER ||
    parsedPort > MAX_PORT_NUMBER
  ) {
    throw new NodeError(
      `Port must be a number between ${MIN_PORT_NUMBER} and ${MAX_PORT_NUMBER}`,
      422,
    );
  }

  await withNodePortLock(nodeId, async () => {
    const pool = await getNodePortPool(nodeId);
    const next = Array.from(new Set([...pool, parsedPort])).sort(
      (a, b) => a - b,
    );
    await syncNodeAllocations(nodeId, next, String(data.ip ?? ""));
    await prisma.node.update({
      where: { id: nodeId },
      data: { allocatedPorts: JSON.stringify(next) },
    });
  });

  return prisma.allocation.findUnique({
    where: {
      nodeId_ip_port: {
        nodeId,
        ip: String(data.ip ?? ""),
        port: parsedPort,
      },
    },
  });
}

/** Delete an allocation. Throws if allocation is claimed by a server. */
export async function deleteAllocation(nodeId: number, allocationId: number) {
  const allocation = await prisma.allocation.findUnique({
    where: { id: allocationId },
  });
  if (!allocation || allocation.nodeId !== nodeId) {
    throw new NodeError("Allocation not found", 404);
  }
  if (allocation.serverId) {
    throw new NodeError("Allocation is in use and cannot be deleted.", 409);
  }

  await withNodePortLock(nodeId, async () => {
    await prisma.allocation.delete({ where: { id: allocation.id } });
    const pool = await getNodePortPool(nodeId);
    await prisma.node.update({
      where: { id: nodeId },
      data: { allocatedPorts: JSON.stringify(pool) },
    });
  });

  return allocation;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export class NodeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "NodeError";
  }
}
