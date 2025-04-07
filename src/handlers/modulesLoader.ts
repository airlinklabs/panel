/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/airlink
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import logger from './logger';

type ModuleResult =
  | { file: string; mod: any }
  | { file: string; error: any };

export const loadModules = async (
  app: express.Express,
  airlinkVersion: string,
) => {
  const modulesDir = path.join(__dirname, '../modules');

  const getFilesRecursively = (dir: string): string[] => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = dirents.flatMap((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(fullPath) : fullPath;
    });
    return files.filter((file) => file.endsWith('.js') || file.endsWith('.ts'));
  };

  const files = getFilesRecursively(modulesDir);

  const modulePromises: Promise<ModuleResult>[] = files.map((file) =>
    import(file)
      .then((mod) => ({ file, mod }))
      .catch((error) => ({ file, error }))
  );

  const modules = await Promise.all(modulePromises);

  // Handle results
  for (const result of modules) {
    if ('error' in result) {
      logger.error(`Failed to load module ${result.file}:`, result.error);
      continue;
    }

    const module = result.mod?.default;
    if (module && module.info && typeof module.router === 'function') {
      const { info, router } = module;

      if (info.version === airlinkVersion) {
        logger.log(`Loading module: ${info.name} (v${info.moduleVersion})`);
        app.use(router());
      } else {
        logger.warn(
          `Skipping ${info.name}: incompatible with AirLink version ${airlinkVersion}`,
        );
      }
    } else {
      logger.warn(
        `Module ${result.file} is missing required exports (info and router).`,
      );
    }
  }
};
