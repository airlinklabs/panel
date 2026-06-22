export interface CacheStore {
  get(key: string): Promise<any | null>;
  set(key: string, data: any, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  clearExpired(): Promise<void>;
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private store = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;

  constructor(options?: { defaultTtlMs?: number; maxSize?: number }) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 10 * 60 * 1000;
    this.maxSize = options?.maxSize ?? 1000;
  }

  async get(key: string): Promise<any | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  async set(key: string, data: any, ttlMs?: number): Promise<void> {
    if (this.store.size >= this.maxSize) {
      this.evictOldest();
    }
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async clearExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

export class SQLiteCacheStore implements CacheStore {
  private prisma: any;
  private tableName = 'ModrinthCache';

  constructor(prisma: any) {
    this.prisma = prisma;
  }

  async get(key: string): Promise<any | null> {
    try {
      const rows = await this.prisma.$queryRaw`
        SELECT data FROM ${this.tableName}
        WHERE cacheKey = ${key} AND expiresAt > datetime('now')
        LIMIT 1
      `;
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.data) {
        return JSON.parse(rows[0].data);
      }
      return null;
    } catch {
      return null;
    }
  }

  async set(key: string, data: any, ttlMs?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > 10 * 1024 * 1024) return;
      const duration = ttlMs ?? 10 * 60 * 1000;
      const expiresAt = new Date(Date.now() + duration).toISOString();
      await this.prisma.$executeRaw`
        INSERT OR REPLACE INTO ${this.tableName} (cacheKey, data, expiresAt)
        VALUES (${key}, ${serialized}, ${expiresAt})
      `;
    } catch {
      // Non-critical
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`DELETE FROM ${this.tableName} WHERE cacheKey = ${key}`;
    } catch {
      // Non-critical
    }
  }

  async clear(): Promise<void> {
    try {
      await this.prisma.$executeRaw`DELETE FROM ${this.tableName}`;
    } catch {
      // Non-critical
    }
  }

  async clearExpired(): Promise<void> {
    try {
      await this.prisma.$executeRaw`DELETE FROM ${this.tableName} WHERE expiresAt <= datetime('now')`;
    } catch {
      // Non-critical
    }
  }
}

export class TwoTierCacheStore implements CacheStore {
  private memory: MemoryCacheStore;
  private sqlite: SQLiteCacheStore;

  constructor(prisma: any, options?: { memoryTtlMs?: number; memoryMaxSize?: number }) {
    this.memory = new MemoryCacheStore({
      defaultTtlMs: options?.memoryTtlMs ?? 5 * 60 * 1000,
      maxSize: options?.memoryMaxSize ?? 500,
    });
    this.sqlite = new SQLiteCacheStore(prisma);
  }

  async get(key: string): Promise<any | null> {
    const memResult = await this.memory.get(key);
    if (memResult !== null) return memResult;

    const dbResult = await this.sqlite.get(key);
    if (dbResult !== null) {
      await this.memory.set(key, dbResult);
      return dbResult;
    }
    return null;
  }

  async set(key: string, data: any, ttlMs?: number): Promise<void> {
    await this.memory.set(key, data, ttlMs);
    await this.sqlite.set(key, data, ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.memory.delete(key);
    await this.sqlite.delete(key);
  }

  async clear(): Promise<void> {
    await this.memory.clear();
    await this.sqlite.clear();
  }

  async clearExpired(): Promise<void> {
    await this.memory.clearExpired();
    await this.sqlite.clearExpired();
  }
}
