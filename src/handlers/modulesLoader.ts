import type express from "express";
import logger from "./logger";

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
  serverPort?: number,
  wsInstance?: { applyTo: (router: express.Router) => void },
) => {
  const { registeredModules } = await import("../modules/registry");
  const modules = registeredModules();

  logger.info("Initializing — loading core modules and components");

  const panelMajor = airlinkVersion.split(".")[0];
  let loaded = 0;
  let errors = 0;

  for (const entry of modules) {
    const mod = entry.module;
    const modMajor = mod.info.version.split(".")[0];

    // Version compatibility is a hard contract: an incompatible module is a
    // misconfiguration that must surface at startup, not a silent skip.
    if (modMajor !== panelMajor) {
      errors++;
      logger.error(
        `[feature-registry] '${entry.name}' requires panel v${mod.info.version} (found v${airlinkVersion})`,
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
      logger.error(
        `[feature-registry] Failed to mount '${entry.name}':`,
        error,
      );
    }
  }

  logger.info(`Loaded ${loaded} modules, errors ${errors}`);

  if (errors > 0) {
    logger.error(`[feature-registry] ${errors} module(s) failed to load`);
  }

  if (serverPort) {
    logger.info(`Server running on http://localhost:${serverPort}`);
  }
};
