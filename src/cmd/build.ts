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
const storageSrc = join(srcPath, 'storage');
const storageDest = join(distPath, 'storage');

async function build() {
  try {
    console.log('Starting build process...');

    // Use parallel execution for independent tasks
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        try {
          console.log('Copying storage...');
          copySync(storageSrc, storageDest, { overwrite: true });
          resolve();
        } catch (error) {
          reject('Error copying storage: ' + error);
        }
      }),
      new Promise<void>((resolve, reject) => {
        try {
          console.log('Copying public assets...');
          copySync(publicSrc, publicDest, { overwrite: true });
          resolve();
        } catch (error) {
          reject('Error copying public assets: ' + error);
        }
      }),
      new Promise<void>((resolve, reject) => {
        try {
          console.log('Copying views...');
          copySync(viewsSrc, viewsDest, { overwrite: true });
          resolve();
        } catch (error) {
          reject('Error copying views: ' + error);
        }
      }),
    ]);

    console.log('Compiling TypeScript...');
    execSync('tsc', { stdio: 'inherit' });


    console.log('Building Tailwind CSS...');
    execSync(
      'tailwindcss build src/public/styles.css -c tailwind.config.js -o dist/public/styles.css',
      { stdio: 'inherit' },
    );
    console.log('Build complete.');
  } catch (error) {
    console.error('Build process failed:', error);
  }
}

build();
