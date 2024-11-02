// build.ts
import { execSync } from 'child_process';
import { copySync } from 'fs-extra';
import { join } from 'path';

// Paths
const srcPath = 'src';
const distPath = 'dist';
const viewsSrc = join(srcPath, 'views');
const viewsDest = join(distPath, 'views');
const publicSrc = join(srcPath, 'public');
const publicDest = join(distPath, 'public');

// Step 1: Compile TypeScript
console.log('Compiling TypeScript...');
execSync('tsc', { stdio: 'inherit' });

// Step 2: Copy views
console.log('Copying views...');
copySync(viewsSrc, viewsDest, { overwrite: true });

// Step 3: Copy public assets
console.log('Copying public assets...');
copySync(publicSrc, publicDest, { overwrite: true });

// Step 4: Build Tailwind CSS
console.log('Building Tailwind CSS...');
execSync(
  'tailwindcss build src/public/styles.css -c tailwind.config.js -o dist/public/styles.css',
  { stdio: 'inherit' },
);

console.log('Build complete.');
