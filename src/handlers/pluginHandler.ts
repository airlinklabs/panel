import fs from 'fs';
import path from 'path';
import express, { Express, Router } from 'express';
import logger from './logger';

interface Plugin {
  name: string;
  version: string;
  main: string;
  router: string;
}

export function loadPlugins(app: Express) {
  const pluginsDir = path.join(__dirname, '../../storage/plugins');
  const pluginFiles = fs
    .readdirSync(pluginsDir)
    .filter((file) => file.endsWith('.addon'));

  if (pluginFiles.length > 0) {
    logger.info(`---- Loadin ${pluginFiles.length} Plugins ----`);

    for (const file of pluginFiles) {
      const filePath = path.join(pluginsDir, file);

      try {
        const pluginData = fs.readFileSync(filePath, 'utf-8');
        const sections = pluginData.split(/^#(.*?)\n/m).slice(1);
        const pluginFilesMap: Record<string, string> = {};

        for (let i = 0; i < sections.length; i += 2) {
          const sectionName = sections[i].trim();
          const content = sections[i + 1];
          pluginFilesMap[sectionName] = content;
        }

        if (!pluginFilesMap['package.json']) {
          throw new Error('Missing package.json section');
        }

        const packageJson: Plugin = JSON.parse(pluginFilesMap['package.json']);
        const pluginMain = packageJson.main;

        if (!pluginFilesMap[pluginMain]) {
          throw new Error(
            `Missing main file (${pluginMain}) in plugin ${packageJson.name}`,
          );
        }

        const pluginFunction = eval(pluginFilesMap[pluginMain]);

        if (typeof pluginFunction !== 'function') {
          logger.error('Invalid main export for plugin', packageJson.name);
          continue;
        }

        const router = Router();
        pluginFunction(router);

        const routePath = packageJson.router;
        app.use(routePath, router);

        logger.info(
          `Loaded plugin: ${packageJson.name} (v${packageJson.version})`,
        );
      } catch (error: any) {
        logger.error(`Failed to load plugin from file ${file}:`, error.message);
      }
    }
  } else {
    logger.info('---- Found 0 Plugins ----');
  }
}
