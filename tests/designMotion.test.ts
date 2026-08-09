import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const css = readFileSync(join(root, 'public', 'tw.css'), 'utf8');
const motionBlock = (() => {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (start === -1) return '';
  const end = css.indexOf('@media', start + 8);
  return end === -1 ? css.slice(start) : css.slice(start, end);
})();

/* Phase 3 motion contract: central motion tokens, reduced-motion must not
   use a global 0.01ms !important kill switch (that would also erase focus
   visibility and state feedback), and travel/scale/stagger must collapse to
   a fast opacity/state change. */

describe('motion tokens', () => {
  it('defines duration and easing tokens centrally', () => {
    for (const token of ['--dur-quick', '--dur-enter', '--dur-exit', '--ease-out']) {
      expect(css.includes(token + ':') || css.includes('--' + token)).toBe(true);
    }
  });
});

describe('prefers-reduced-motion block', () => {
  it('does NOT kill transitions globally (state feedback + focus survive)', () => {
    expect(motionBlock).not.toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    // the "*" selector must not carry the transition kill either
    expect(motionBlock).not.toMatch(/\*[\s\S]*?transition-duration:\s*0\.01ms\s*!important/);
  });

  it('collapses travel/scale/stagger animations to their end state', () => {
    expect(motionBlock).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(motionBlock).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(motionBlock).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('keeps opacity as the allowed reduced-motion channel', () => {
    expect(motionBlock).toMatch(/opacity/);
  });

  it('targets the traveling entrances instead of every element', () => {
    for (const sel of ['dialog.al-dialog[open]', '.al-sheet-panel', '.pa-row']) {
      expect(motionBlock).toContain(sel);
    }
  });
});

/* Theme token contrast: every shipped theme must keep text and surface
   readable (WCAG AA-ish floor for body text tokens). */

describe('theme token contrast', () => {
  const themesDir = join(root, 'public', 'themes');
  const files = readdirSync(themesDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(themesDir, f));

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function luminance([r, g, b]) {
    const c = [r, g, b].map((x) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const la = luminance(hexToRgb(a));
    const lb = luminance(hexToRgb(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  it('every theme defines a text token at 4.5:1 against its card surface', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const bg = /--theme-bg-card:\s*([^;]+);/.exec(src);
      const text = /--theme-text:\s*([^;]+);/.exec(src);
      const textStrong = /--theme-text-strong:\s*([^;]+);/.exec(src);
      expect(bg, `${file} needs --theme-bg-card`).toBeTruthy();
      expect(text, `${file} needs --theme-text`).toBeTruthy();

      const bgRgb = hexToRgb(bg[1].trim());
      const textRgb = hexToRgb(text[1].trim());
      if (bgRgb && textRgb) {
        const c = contrast(bg[1].trim(), text[1].trim());
        expect(c, `${file} --theme-text vs --theme-bg-card contrast`).toBeGreaterThanOrEqual(4.5);
      }
      if (textStrong) {
        const strongRgb = hexToRgb(textStrong[1].trim());
        if (strongRgb) {
          const c = contrast(bg[1].trim(), textStrong[1].trim());
          expect(c, `${file} --theme-text-strong vs --theme-bg-card contrast`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
