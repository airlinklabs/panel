// clean.ts
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { removeSync } from 'fs-extra';

const distPath = 'dist';

// Ensure the `dist` directory exists
if (!existsSync(distPath)) {
  mkdirSync(distPath);
}

// Clean all contents in `dist`, excluding `storage`
readdirSync(distPath).forEach((dir) => {
  if (dir !== 'storage') {
    removeSync(`${distPath}/${dir}`);
  }
});

console.log('Cleaned dist directory, excluding storage.');
