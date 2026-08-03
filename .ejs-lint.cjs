const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.pnpm']);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.ejs')) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const files = [];
walk(ROOT, files);
files.sort();

let failed = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  try {
    ejs.compile(src, { filename: file });
  } catch (err) {
    failed++;
    const rel = path.relative(ROOT, file);
    let line = '?';
    try {
      line = String(src.slice(0, src.length).split('\n').length);
    } catch {}
    console.log(`FAIL  ${rel}`);
    console.log(`      ${String(err.message).split('\n')[0]}`);
  }
}

console.log(`\n${files.length - failed}/${files.length} EJS files compile clean${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
