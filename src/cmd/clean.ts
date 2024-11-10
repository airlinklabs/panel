import { existsSync, mkdirSync, readdirSync } from 'fs';
import { removeSync } from 'fs-extra';

const distPath = 'dist';

async function clean () {
  if (existsSync(distPath)) {
    const folders = readdirSync(distPath);
    const foldersToClean = folders.filter(folder => folder !== 'storage');
    await Promise.all(foldersToClean.map(folder => removeSync(`${distPath}/${folder}`)));
  }

  console.log('Cleaned dist directory, excluding storage.');
}

clean();