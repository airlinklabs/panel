import type { AddonApi } from './types';

interface CacheEntry {
  data: string;
  expiresAt: number;
}

const DEFAULT_TTL = 10 * 60 * 1000;

export class CacheStore {
  private memory = new Map<string, CacheEntry>();
  private cleanupScheduled = false;

  constructor(private prisma: any) {}

  async get(key: string): Promise<any | null> {
    const mem = this.memory.get(key);
    if (mem) {
      if (Date.now() < mem.expiresAt) return JSON.parse(mem.data);
      this.memory.delete(key);
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe(
        'SELECT data, expiresAt FROM ModrinthCache WHERE cacheKey = ?',
        key
      );
      const row = (rows as any[])[0];
      if (!row) return null;

      const expiresAt = new Date(row.expiresAt).getTime();
      if (Date.now() > expiresAt) {
        this.prisma.$executeRawUnsafe('DELETE FROM ModrinthCache WHERE cacheKey = ?', key).catch(() => {});
        return null;
      }

      this.memory.set(key, { data: row.data, expiresAt });
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  async set(key: string, data: any, ttlMs = DEFAULT_TTL): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const json = JSON.stringify(data);

    this.memory.set(key, { data: json, expiresAt: Date.now() + ttlMs });

    try {
      await this.prisma.$executeRawUnsafe(
        'INSERT OR REPLACE INTO ModrinthCache (cacheKey, data, expiresAt) VALUES (?, ?, ?)',
        key, json, expiresAt
      );
    } catch {
      // best-effort
    }

    this.scheduleCleanup();
  }

  async clear(): Promise<void> {
    this.memory.clear();
    try {
      await this.prisma.$executeRawUnsafe('DELETE FROM ModrinthCache');
    } catch {
      // best-effort
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupScheduled) return;
    this.cleanupScheduled = true;
    setTimeout(() => {
      this.cleanupScheduled = false;
      this.cleanupExpired().catch(() => {});
    }, 60_000);
  }

  private async cleanupExpired(): Promise<void> {
    for (const [key, entry] of this.memory) {
      if (Date.now() > entry.expiresAt) this.memory.delete(key);
    }
    try {
      await this.prisma.$executeRawUnsafe(
        'DELETE FROM ModrinthCache WHERE expiresAt < ?',
        new Date().toISOString()
      );
    } catch {
      // best-effort
    }
  }
}
