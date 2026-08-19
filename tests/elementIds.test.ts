import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Static integrity checks across the EJS/JS split: every element ID a
// client script looks up must exist statically in the views (panel or
// addon) or be created dynamically (icon() id option, createElement +
// id=, innerHTML templates). Regressions here silently disable UI
// features (e.g. the allocations editor on server settings once showed a
// permanent "Loading allocations..." because markup and script disagreed).

function walk(dir: string, acc: string[] = [], skip: Set<string>): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc, skip);
    else if (/\.(ejs|js|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const SKIP_JS = new Set(['modrinth-admin-mobile.js']);

const root = join(__dirname, '..');

const viewsOnly: string[] = [];

function allSourceFiles(): string[] {
  const skip = new Set(['.tmp-ejs-lint']);
  const files: string[] = [];
  walk(join(root, 'views'), files, skip);
  viewsOnly.push(...walk(join(root, 'views'), [], skip));
  walk(join(root, 'public', 'javascript'), files, skip);
  const addonViews = join(root, 'storage', 'addons');
  if (existsSync(addonViews)) {
    for (const addon of readdirSync(addonViews, { withFileTypes: true })) {
      if (!addon.isDirectory()) continue;
      walk(join(addonViews, addon.name, 'views'), files, skip);
    }
  }
  return files;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('element id integrity', () => {
  const files = allSourceFiles();

  const staticIds = new Set<string>();
  const dynamicIds = new Set<string>();
  const contents = new Map<string, string>();
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    contents.set(file, content);
    for (const m of content.matchAll(/id="([^"]+)"/g)) staticIds.add(m[1]);
    // icon('name', { id: 'x', ... }) renders id="x" server-side
    for (const m of content.matchAll(/icon\(\s*'[^']+'\s*,\s*\{([^}]*)\}/g)) {
      const opts = m[1];
      const idMatch = opts.match(/\bid:\s*'([^']+)'/);
      if (idMatch) dynamicIds.add(idMatch[1]);
    }
    // element.id = 'x' or id:'x' inside template literals
    for (const m of content.matchAll(/\bid\s*[=:]\s*'([^']+)'/g)) dynamicIds.add(m[1]);
    for (const m of content.matchAll(/setAttribute\(\s*'id'\s*,\s*'([^']+)'\)/g)) dynamicIds.add(m[1]);
  }

  it('every getElementById target exists statically or is created somewhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.js') || !file.includes('public')) continue;
      const content = contents.get(file)!;
      for (const m of content.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
        const id = m[1];
        if (staticIds.has(id) || dynamicIds.has(id)) continue;
        // created via innerHTML template in the same file
        const inHtml = new RegExp(`id=["'']${escapeRegExp(id)}["'']`);
        if (inHtml.test(content)) continue;
        offenders.push(`${file.replace(root + '/', '')} -> ${id}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('no client script references the removed server-started-at element id', () => {
    for (const file of files) {
      if (!file.endsWith('.js') || !file.includes('public')) continue;
      const content = contents.get(file)!;
      expect(content).not.toMatch(/getElementById\(['"]server-started-at['"]\)/);
    }
  });

  it('inline scripts in views only reference ids defined in that view', () => {
    const offenders: string[] = [];
    for (const file of viewsOnly) {
      const content = contents.get(file)!;
      const localIds = new Set<string>();
      for (const m of content.matchAll(/id="([^"]+)"/g)) localIds.add(m[1]);
      // shared includes known to own their ids
      for (const shared of ['al-activity-chip', 'topbar-breadcrumbs', 'sidebar-username', 'toast-container', 'colcont']) {
        localIds.add(shared);
      }
      for (const m of content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
        const code = m[1];
        for (const g of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          const id = g[1];
          if (localIds.has(id)) continue;
          // created dynamically inside this same file
          const created = new RegExp(`id\\s*[=:]\\s*['"]${escapeRegExp(id)}['"]`);
          if (created.test(content)) continue;
          offenders.push(`${file.replace(root + '/', '')} -> ${id}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
