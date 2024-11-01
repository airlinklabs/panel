/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLab
 *      Repository: https://github.com/airlinklab/airlink
 *
 *     © 2024 AirlinkLab. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express from 'express';
import fs from 'fs';
import path from 'path';

export const loadModules = async (app: express.Express, airlinkVersion: string) => {
  const modulesDir = path.join(__dirname, '../modules');
  const files = fs.readdirSync(modulesDir);

  for (const file of files) {
    const modulePath = path.join(modulesDir, file);
    if (file.endsWith('.js') || file.endsWith('.ts')) {
      try {
        const { default: module } = await import(modulePath);
        if (module && module.info && typeof module.router === 'function') {
          const { info, router } = module;

          if (info.version === airlinkVersion) {
            console.log(
              `Loading module: ${info.name} (v${info.moduleVersion})`
            );
            app.use(router()); // Use the router from the module
          } else {
            console.warn(
              `Skipping ${info.name}: incompatible with AirLink version ${airlinkVersion}`
            );
          }
        } else {
          console.warn(
            `Module ${file} is missing required exports (info and router).`
          );
        }
      } catch (error) {
        console.error(`Failed to load module ${file}:`, error);
      }
    }
  }
};
