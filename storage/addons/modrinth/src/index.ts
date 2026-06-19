// ── Modrinth Store Addon — Entry Point ──
// Wires up all components: cache, API client, settings, routes, sidebar, lifecycle.

import type { Router } from 'express';
import type { AddonApi } from './types/panel';
import { CacheStore } from './lib/cache-store';
import { ModrinthClient } from './lib/modrinth-client';
import { DaemonClient } from './lib/daemon-client';
import { Installer } from './lib/installer';
import { SettingsStore } from './lib/settings-store';
import { DependencyResolver } from './lib/dependency-resolver';
import { UpdateChecker } from './lib/update-checker';
import { registerSidebar } from './ui/sidebar';
import { createLifecycleHooks } from './ui/lifecycle';
import { createRouter } from './routes';

export default async function modrinthAddon(router: Router, api: AddonApi) {
  // ── Initialize core services ──
  const cache = new CacheStore(api.logger, api.prisma);
  const modrinth = new ModrinthClient(api.logger, api.security, cache);
  const daemon = new DaemonClient(api.logger, api.security);
  const settings = new SettingsStore(api.config, api.logger);
  const installer = new Installer({ logger: api.logger, prisma: api.prisma, security: api.security, modrinth, daemon });
  const dependencyResolver = new DependencyResolver(api.logger, modrinth);
  const updateChecker = new UpdateChecker(api.logger, api.prisma, modrinth);

  // ── Register sidebar items ──
  registerSidebar(api);

  // ── Create and mount router ──
  const addonRouter = createRouter({
    api,
    cache,
    modrinth,
    daemon,
    installer,
    settings,
    updateChecker,
  });

  router.use('/', addonRouter);

  // ── Register scheduled task: check for updates every 6 hours ──
  api.schedule.register({
    id: 'modrinth-update-check',
    intervalMs: 6 * 60 * 60 * 1000,
    handler: async () => {
      try {
        const updates = await updateChecker.checkAll();
        if (updates.length > 0) {
          api.logger.info(`Found ${updates.length} mod updates available`);
        }
      } catch (error: any) {
        api.logger.error(`Update check failed: ${error.message}`);
      }
    },
  });

  // ── Return lifecycle hooks ──
  return createLifecycleHooks(api, cache);
}
