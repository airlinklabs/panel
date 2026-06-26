import prisma from '../db';
import logger from '../services/logger';

export interface AddonConfigStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getMany(keys: string[]): Promise<Record<string, string | null>>;
  setMany(entries: Record<string, string>): Promise<void>;
  delete(key: string): Promise<void>;
  deleteAll(): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}

function createConfigStore(addonSlug: string): AddonConfigStore {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const row = await prisma.addonSetting.findUnique({
          where: { addonSlug_key: { addonSlug, key } },
        });
        return row?.value ?? null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Addon config get failed for "${addonSlug}":`, msg);
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      try {
        await prisma.addonSetting.upsert({
          where: { addonSlug_key: { addonSlug, key } },
          create: { addonSlug, key, value },
          update: { value },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Addon config set failed for "${addonSlug}":`, msg);
      }
    },

    async getMany(keys: string[]): Promise<Record<string, string | null>> {
      const result: Record<string, string | null> = {};
      for (const key of keys) {
        result[key] = await this.get(key);
      }
      return result;
    },

    async setMany(entries: Record<string, string>): Promise<void> {
      for (const [key, value] of Object.entries(entries)) {
        await this.set(key, value);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await prisma.addonSetting.deleteMany({
          where: { addonSlug, key },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Addon config delete failed for "${addonSlug}":`, msg);
      }
    },

    async deleteAll(): Promise<void> {
      try {
        await prisma.addonSetting.deleteMany({
          where: { addonSlug },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Addon config deleteAll failed for "${addonSlug}":`, msg);
      }
    },

    async getAll(): Promise<Record<string, string>> {
      try {
        const rows = await prisma.addonSetting.findMany({
          where: { addonSlug },
        });
        const result: Record<string, string> = {};
        for (const row of rows) {
          result[row.key] = row.value;
        }
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Addon config getAll failed for "${addonSlug}":`, msg);
        return {};
      }
    },
  };
}

export { createConfigStore };
