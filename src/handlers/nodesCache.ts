import prisma from '../db';
import { cache } from './cache';

const NODES_KEY = 'nodes:list';
const LOCATIONS_KEY = 'locations:list';
const NODES_TTL = 30; // 30 seconds — nodes change status frequently
const LOCATIONS_TTL = 300; // 5 minutes

/**
 * Get all nodes with allocations (used on node pages) with Redis cache.
 */
export async function getNodesWithAllocations() {
  return cache.wrap(NODES_KEY, NODES_TTL, () =>
    prisma.node.findMany({
      include: { allocations: true, location: true },
    }),
  );
}

/**
 * Get all locations with node counts with Redis cache.
 */
export async function getLocationsWithCounts() {
  return cache.wrap(LOCATIONS_KEY, LOCATIONS_TTL, () =>
    prisma.location.findMany({
      include: { _count: { select: { nodes: true } } },
      orderBy: { id: 'asc' },
    }),
  );
}

/**
 * Invalidate node caches. Call after node create/update/delete.
 */
export async function invalidateNodeCache() {
  await cache.del(NODES_KEY);
}

/**
 * Invalidate location caches. Call after location create/update/delete.
 */
export async function invalidateLocationCache() {
  await cache.del(LOCATIONS_KEY);
}
