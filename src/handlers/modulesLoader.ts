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
  const modules = registeredModules();

  logger.info(logT('log.initializingModules'));

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
