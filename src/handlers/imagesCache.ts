import prisma from '../db';
import { cache } from './cache';

const IMAGES_LIST_KEY = 'images:list:approved';
const IMAGES_ALL_KEY = 'images:list:all';
const IMAGES_TTL = 120; // 2 minutes

/**
 * Get approved images (user-facing) with Redis cache.
 */
export async function getApprovedImages() {
  return cache.wrap(IMAGES_LIST_KEY, IMAGES_TTL, () =>
    prisma.images.findMany({ where: { status: 'approved' } })
  );
}

/**
 * Get all images (admin-facing) with Redis cache.
 */
export async function getAllImages() {
  return cache.wrap(IMAGES_ALL_KEY, IMAGES_TTL, () =>
    prisma.images.findMany()
  );
}

/**
 * Invalidate image caches. Call after any image create/update/delete.
 */
export async function invalidateImageCache() {
  await cache.del(IMAGES_LIST_KEY);
  await cache.del(IMAGES_ALL_KEY);
}
