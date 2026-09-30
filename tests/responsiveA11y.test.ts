import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

function readFile(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function globEjs(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {walk(join(d, entry.name));}
      else if (entry.name.endsWith('.ejs')) {out.push(join(d, entry.name));}
    }
  };
  walk(join(root, dir));
  return out;
}

/* ------------------------------------------------------------------ */
/* ARIA attributes — every interactive component must be keyboard and  */
/* screen-reader safe. These tests verify structural ARIA patterns.   */
/* ------------------------------------------------------------------ */

describe('ARIA: tabs', () => {
  const tabSrc = readFile('public/javascript/shared/al-tabs.js');

  it('queries for role="tabpanel" elements', () => {
    expect(tabSrc).toContain('[role="tabpanel"]');
  });

  it('queries for role="tab" elements', () => {
    expect(tabSrc).toContain('[role="tab"]');
  });

  it('manages aria-selected on tab activation', () => {
    expect(tabSrc).toContain('aria-selected');
  });

  it('manages tabindex for roving focus', () => {
    expect(tabSrc).toContain('tabindex');
  });

  it('hides inactive panels with hidden attribute', () => {
    expect(tabSrc).toContain('hidden');
  });

  it('supports arrow key navigation', () => {
    expect(tabSrc.includes('ArrowRight') || tabSrc.includes('ArrowLeft')).toBe(
      true,
    );
  });
});

describe('ARIA: toast', () => {
  const toastEjs = readFile('views/partials/toast.ejs');

  it('toast container has aria-live="polite"', () => {
    expect(toastEjs).toContain('setAttribute(\'aria-live\', \'polite\')');
  });

  it('toast container has role="status"', () => {
    expect(toastEjs).toContain('setAttribute(\'role\', \'status\')');
  });
});

/* ------------------------------------------------------------------ */
/* Responsive patterns — mobile breakpoints and layout constraints.   */
/* ------------------------------------------------------------------ */

describe('responsive: layout patterns', () => {
  it('sidebar hides on small screens (lg:block)', () => {
    const ejs = readFile('views/layouts/user.ejs');
    expect(ejs).toMatch(/hidden\s+lg:block/);
  });

  it('page content has overflow-y-auto for scroll isolation', () => {
    const ejs = readFile('views/layouts/user.ejs');
    expect(ejs).toMatch(/overflow-y-auto/);
  });
});

describe('responsive: toast container', () => {
  const toastEjs = readFile('views/partials/toast.ejs');

  it('toast uses max-sm breakpoints for mobile', () => {
    expect(toastEjs).toContain('max-sm:left-4');
    expect(toastEjs).toContain('max-sm:right-4');
  });

  it('toast has max-width constraint', () => {
    expect(toastEjs).toContain('max-width');
  });
});

/* ------------------------------------------------------------------ */
/* Keyboard: focus management and escape handling.                     */
/* ------------------------------------------------------------------ */

describe('keyboard: focus management', () => {
  const tabsSrc = readFile('public/javascript/shared/al-tabs.js');

  it('tabs focuses the active tab on activation', () => {
    expect(tabsSrc).toContain('.focus()');
  });
});

/* ------------------------------------------------------------------ */
/* Accessibility: heading hierarchy and landmark roles.               */
/* ------------------------------------------------------------------ */

describe('accessibility: landmark roles', () => {
  const layoutEjs = readFile('views/layouts/user.ejs');

  it('uses <main> element for page content', () => {
    expect(layoutEjs).toContain('<main');
  });
});

describe('accessibility: form labels', () => {
  const accountEjs = readFile('views/user/account.ejs');

  it('account page has labeled form inputs', () => {
    expect(accountEjs).toMatch(/for="[^"]+"/);
  });
});
