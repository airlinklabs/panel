#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(__dirname, '../storage/lang');
const LOCALES_DIR = path.join(__dirname, '../locales');

const languages = fs.readdirSync(LANG_DIR).filter(function(entry) {
  try { return fs.statSync(path.join(LANG_DIR, entry)).isDirectory(); }
  catch(e) { return false; }
});

console.log(`Migrating ${  languages.length  } language(s): ${  languages.join(', ')}`);

languages.forEach(function(lang) {
  const oldPath = path.join(LANG_DIR, lang, 'lang.json');
  const newPath = path.join(LOCALES_DIR, lang, 'messages.json');

  if (!fs.existsSync(oldPath)) {
    console.log(`  Skipping ${  lang}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
  const catalog = {};

  Object.keys(raw).forEach(function(key) {
    if (key.charAt(0) === '_') {return;}
    const value = raw[key];
    if (typeof value === 'string') {
      catalog[key] = value;
    } else if (typeof value === 'object' && value !== null && 'one' in value && 'other' in value) {
      catalog[key] = `{count, plural, one {${  value.one  }} other {${  value.other  }}}`;
    }
  });

  const targetDir = path.dirname(newPath);
  if (!fs.existsSync(targetDir)) {fs.mkdirSync(targetDir, { recursive: true });}
  fs.writeFileSync(newPath, `${JSON.stringify(catalog, null, 2)  }\n`);

  const count = Object.keys(catalog).length;
  const pluralCount = Object.values(catalog).filter(function(v) { return v.indexOf('plural') !== -1; }).length;
  console.log(`  ${  lang  }: ${  count  } messages (${  pluralCount  } plurals)`);
});

console.log('Done.');
