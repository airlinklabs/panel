// ── Lifecycle Hooks ──

import type { AddonApi, AddonConfigStore } from '../types/panel';
import type { CacheStore } from '../lib/cache-store';
import { progressTracker } from '../lib/progress-tracker';

export function createLifecycleHooks(
  api: AddonApi,
  cache: CacheStore
) {
  return {
    onInstall: async () => {
      api.logger.info('Modrinth addon installed');
    },

    onEnable: async () => {
      api.logger.info('Modrinth addon enabled');
    },

    onDisable: async () => {
      api.logger.info('Modrinth addon disabled');
    },

    onUpdate: async (previousVersion: string) => {
      api.logger.info(`Modrinth addon updated from ${previousVersion}`);
    },

    onUninstall: async () => {
      api.logger.info('Modrinth addon uninstalling — cleaning up');

      // Clear cache
      await cache.clear().catch(() => {});

      // Clear progress tracker
      progressTracker.destroy();

      // Clear config keys individually (best-effort)
      const configKeys = [
        'showWarningBanner', 'warningTitle', 'warningMessage',
        'disabledProjectTypes', 'blockedProjects',
      ];
      for (const key of configKeys) {
        await api.config.delete(key).catch(() => {});
      }
    },
  };
}
