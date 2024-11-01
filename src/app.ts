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
import config from './storage/config.json';

const app = express();
const port = 3000;

const airlinkVersion = config.meta.version;

const loadModules = async () => {
    const modulesDir = path.join(__dirname, 'modules');
    const files = fs.readdirSync(modulesDir);

    for (const file of files) {
        const modulePath = path.join(modulesDir, file);
        if (file.endsWith('.js') || file.endsWith('.ts')) {
            try {
                const { default: module } = await import(modulePath);
                if (module && module.info && typeof module.init === 'function') {
                    const { info, init } = module;

                    if (info.version === airlinkVersion) {
                        console.log(`Loading module: ${info.name} (v${info.moduleVersion})`);
                        init(app);
                    } else {
                        console.warn(`Skipping ${info.name}: incompatible with AirLink version ${airlinkVersion}`);
                    }
                } else {
                    console.warn(`Module ${file} is missing required exports (info and init).`);
                }
            } catch (error) {
                console.error(`Failed to load module ${file}:`, error);
            }
        }
    }
};

loadModules().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}).catch(err => {
    console.error("Failed to load modules:", err);
});
