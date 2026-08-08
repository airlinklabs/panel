const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, acc); }
    else if (e.name.endsWith('.ejs')) acc.push(p);
  }
  return acc;
}

const files = walk(path.join(__dirname, 'views'));

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m, idx = 0;
  while ((m = re.exec(src))) {
    idx++;
    const attrs = m[1] || '';
    if (/src\s*=/.test(attrs)) { continue; }
    const body = m[2];
    // crude top-level const/let/class detection: a line that starts (after ws)
    // with const/let/class, not inside any braces we track at zero depth.
    let depth = 0, risky = [], lines = body.split('\n');
    let blockComment = false;
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      // naive: strip strings/comments later; copy current depth
      const d = l.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
      const t = d.trim();
      if (depth === 0 && /^(const|let|class)\b/.test(t)) {
        risky.push((i + 1) + ': ' + t.slice(0, 70));
      }
      depth += ((t.match(/{/g) || []).length) - ((t.match(/}/g) || []).length);
    }
    if (risky.length) {
      console.log('=== ' + path.relative(__dirname, f).replace('..', '') + '  script#' + idx);
      risky.forEach(r => console.log('    ' + r));
    }
  }
}