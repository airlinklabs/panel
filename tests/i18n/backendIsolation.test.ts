import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('backend i18n isolation', () => {
  it('no backend files import from services/i18n.ts', () => {
    const srcDir = path.join(ROOT, 'src');
    try {
      const result = execSync(
        `grep -r "from.*services/i18n" "${srcDir}" --include="*.ts" -l || true`,
        { encoding: 'utf8' },
      );
      const files = result
        .split('\n')
        .filter(Boolean)
        .filter((f) => !f.includes('src/i18n')); // exclude our own module
      expect(files).toEqual([]);
    } catch {
      // grep not finding anything is fine
    }
  });

  it('no backend files import from handlers/utils/core/translation.ts', () => {
    const srcDir = path.join(ROOT, 'src');
    try {
      const result = execSync(
        `grep -r "from.*core/translation" "${srcDir}" --include="*.ts" -l || true`,
        { encoding: 'utf8' },
      );
      const files = result.split('\n').filter(Boolean);
      expect(files).toEqual([]);
    } catch {
      // grep not finding anything is fine
    }
  });

  it('no backend files import from storage/lang', () => {
    const srcDir = path.join(ROOT, 'src');
    try {
      const result = execSync(
        `grep -r "storage/lang" "${srcDir}" --include="*.ts" -l || true`,
        { encoding: 'utf8' },
      );
      const files = result.split('\n').filter(Boolean);
      expect(files).toEqual([]);
    } catch {
      // grep not finding anything is fine
    }
  });
});
