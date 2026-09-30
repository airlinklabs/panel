#!/usr/bin/env node

/**
 * CI gate: ensures page controllers under src/modules/pages/ do NOT import
 * Prisma, daemon access, or business services directly.
 *
 * Usage:
 *   node scripts/check-page-boundary.mjs
 *
 * Exit code 0 = clean, 1 = violations found.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PAGES_DIR = join(import.meta.dirname, '..', 'src', 'modules', 'pages');

/**
 * Patterns that page controllers must NOT import.
 * Each entry: { pattern: RegExp, label: string }
 */
const FORBIDDEN = [
  {
    pattern: /from\s+['"].*\/db(?:['"]|\/)/,
    label: 'Prisma/DB import',
  },
  {
    pattern: /import\s+.*from\s+['"].*prisma['"]/,
    label: 'Prisma import',
  },
  {
    pattern: /require\(['"].*\/db(?:['"]|\/)/,
    label: 'Prisma/DB require',
  },
  {
    pattern: /from\s+['"].*daemonRequest['"]/,
    label: 'daemonRequest import',
  },
  {
    pattern: /from\s+['"].*daemonService['"]/,
    label: 'daemonService import',
  },
  {
    pattern: /require\(['"].*daemonRequest['"]/,
    label: 'daemonRequest require',
  },
  {
    pattern: /require\(['"].*daemonService['"]/,
    label: 'daemonService require',
  },
  // Business services that bypass the internal API boundary
  {
    pattern: /from\s+['"].*\/services\/(?!i18n)['"]/,
    label: 'business service import',
  },
  {
    pattern: /require\(['"].*\/services\/(?!i18n)['"]/,
    label: 'business service require',
  },
];

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

// ── Main ────────────────────────────────────────────────────────────────────

const files = collectTsFiles(PAGES_DIR);
const violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    for (const { pattern, label } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push({
          file: relPath,
          line: i + 1,
          label,
          code: line.trim(),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `\x1b[32m✓ Page boundary check passed — ${files.length} files scanned, no forbidden imports.\x1b[0m`,
  );
  process.exit(0);
}

console.error(
  `\x1b[31m✗ Page boundary check FAILED — ${violations.length} violation(s) in ${files.length} files:\x1b[0m`,
);
console.error();

for (const v of violations) {
  console.error(`  \x1b[33m${v.file}:${v.line}\x1b[0m — ${v.label}`);
  console.error(`    ${v.code}`);
}

console.error();
console.error(
  'Page controllers must use the internal API client (src/handlers/internalApiClient.ts)',
);
console.error(
  'instead of importing Prisma, daemon access, or business services directly.',
);
process.exit(1);
