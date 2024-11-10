import { copySync } from 'fs-extra';
import { join } from 'path';
import chokidar from 'chokidar';

const viewsSrc = join(__dirname, '../..', 'src', 'views');
const viewsDest = join(__dirname, '../..', 'dist', 'views');

const buildViews = () => {
  console.log('Copying views...');
  copySync(viewsSrc, viewsDest, { overwrite: true, errorOnExist: false, preserveTimestamps: true });
  console.log('Views copied successfully.');
};

const watchViews = () => {
  console.log(`Watching for changes in .ejs views at ${viewsSrc}...`);

  chokidar.watch(`${viewsSrc}`).on('all', (event, path) => {
    console.log(`File ${path} has been ${event}.`);

    // Only copy views if the event is an add or change
    if (event === 'add' || event === 'change') {
      buildViews(); // Call the function to copy views when a change is detected
    } else {
      console.log(event);
    }
  });
};

watchViews();
