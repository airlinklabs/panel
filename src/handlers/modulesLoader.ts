import type express from 'express';
import logger from './logger';
import { logT } from '../services/i18n';

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number,
  wsInstance?: { applyTo: (router: express.Router) => void },
) => {
  const { registeredModules } = await import('../modules/registry');
  const { pageModules } = await import('../modules/pages');

  // Page controllers own the rewritten routes: they render the current view
  // tree (views/admin/*/index.ejs …) and read all of their data from the v2
  // API. They mount first so they win over a legacy module registered on the
  // same path; legacy modules stay mounted behind them for the routes the
  // rewrite has not covered yet.
  const modules = [
    ...pageModules.map((mod) => ({
      module: mod,
      name: `pages/${mod.info.name}`,
    })),
    ...registeredModules(),
  ];

  logger.info(logT('log.initializingModules'));
  logger.info(logT('log.pageModulesMounted', { count: pageModules.length }));

  const panelMajor = airlinkVersion.split('.')[0];
  let loaded = 0;
  let errors = 0;

  for (const entry of modules) {
    const mod = entry.module;
    const modMajor = mod.info.version.split('.')[0];

    // Version compatibility is a hard contract: an incompatible module is a
    // misconfiguration that must surface at startup, not a silent skip.
    if (modMajor !== panelMajor) {
      errors++;
      logger.error(
        logT('log.moduleVersionMismatch', {
          name: entry.name,
          required: mod.info.version,
          current: airlinkVersion,
        }),
      );
      continue;
    }

    try {
      const router = mod.router(
        wsInstance ? (r: express.Router) => wsInstance.applyTo(r) : undefined,
      );
      app.use(router);
      loaded++;
    } catch (error) {
      errors++;
      logger.error(logT('log.moduleFailedMount', { name: entry.name }), error);
    }
  }

  logger.info(logT('log.modulesLoaded', { loaded, errors }));

  if (errors > 0) {
    logger.error(logT('log.modulesFailedCount', { count: errors }));
  }

  if (serverPort) {
    logger.info(logT('log.serverRunning', { port: serverPort }));
  }
};
