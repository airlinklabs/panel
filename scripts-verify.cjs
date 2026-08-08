// Verifier: for each .ejs file, extract inline <script> blocks and check:
// 1. No top-level const/let/class remain inside (i.e. all blocks start with
//    an IIFE wrapper or are otherwise already scoped).
// 2. Every function referenced from inline HTML attributes (onclick/onkeydown/
//    onchange/onsubmit etc.) is assigned to window.* inside some script block.
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

let scanTop = 0;
let scanAttr = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) {
    if (!/src\s*=/.test(m[1])) blocks.push(m[2]);
  }

  // ---- 1. top-level const/let/class check ----
  const RISKY = [];
  blocks.forEach((body, i) => {
    const stripped = body.replace(/<%.*?%>/g, '');
    let depth = 0;
    const lines = stripped.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      // strip nested comment blocks and string contents to keep brace count sane
      let cleaned = '';
      let insideString = false, strCh = '';
      for (const ch of lines[idx]) {
        if (insideString) { if (ch === strCh) insideString = false; cleaned += ' '; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { insideString = true; strCh = ch; cleaned += ' '; continue; }
        cleaned += ch;
      }
      const t = cleaned.trim();
      if (depth === 0 && /^(const|let|class)\b/.test(t)) {
        RISKY.push((i + 1) + ': ' + t.slice(0, 60));
      }
      depth += ((t.match(/{/g) || []).length) - ((t.match(/}/g) || []).length);
    }
  });

  // ---- 2. inline HTML attribute function refs ----
  const htmlOnly = src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const refs = new Set();
  const attrRe = /\bon(?:click|keydown|keypress|change|submit|load|input|mouseup|mousedown|focus|blur|dblclick|contextmenu|paste)="([^"]*)"/gi;
  while ((m = attrRe.exec(htmlOnly))) {
    const js = m[1].replace(/<%.*?%>/g, '').replace(/&quot;/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(js))) {
      const id = c[1];
      if (id === 'window' || id === 'event' || id === 'return' || id === 'document') continue;
      refs.add(id);
    }
  }

  // ---- window.* exports across all blocks ----
  const allJs = blocks.join('\n');
  const exportsSet = new Set();
  const expRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = expRe.exec(allJs))) exportsSet.add(m[1]);

  const missing = [...refs].filter(r => !exportsSet.has(r)).sort();
  if (RISKY.length) {
    scanTop++;
    console.log(`\n[TOP-LEVEL] ${path.relative(__dirname, f)}`);
    RISKY.forEach(r => console.log('   ' + r));
  }
  if (missing.length) {
    scanAttr++;
    console.log(`\n[ATTR-REF] ${path.relative(__dirname, f)}`);
    missing.forEach(r => console.log('   missing window export:', r));
  }
}

console.log(`\n---- ${scanTop} files with top-level const/let/class. ${scanAttr} files with unmapped attribute refs.`);