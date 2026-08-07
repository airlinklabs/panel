# Phase 6 Report — Theme / Contrast / Motion (B-060, B-061, B-062, B-064, B-077)

## Goal
Close the theme-system and contrast gaps flagged by the audit: active-state inversion fighting the 64-var theme system, sub-AA nav/quiet text contrast, undefined/duplicate theme variables, and the motion-spring edge case.

## Fixes
- **B-062** — Active-state inversion removed. `#sliding-background`, `.nav-link2.nav2-active`, `[data-active="true"]`, sidebar `#active-background`/`.nav-link.active`, and `.mobile-nav-link.active-mobile` all use `--theme-accent` / `--theme-accent-text`. The sidebar pill's comment (and the code) no longer inverts `--theme-text`/`--theme-bg`. `hide-scrollbars.css` was already deleted in a prior commit, so its hardcoded checkbox colors are moot.
- **B-060** — Quiet text: the only surviving raw `opacity-70` text site (user databases empty-state, `views/user/server/databases.ejs`) now uses `color:var(--theme-text-muted)`. The other ledger sites were already token-based or the components (breadcrumb, alert) were deleted in P2.
- **B-061** — Nav text/icons bumped to WCAG AA across all 7 theme files (verified by computed contrast ratios):
  - nav text: default-dark `#8a8a8a` (5.47:1), solarized-dark `#839496` (5.32:1), solarized-light `#4b5a63` (5.83:1), user dark `#8a8a8a` (5.47:1), user light `#525252` (7.17:1); default-light and material already passed.
  - nav icons (≥3:1): default-dark `#767676` (4.16:1), solarized-light `#4b5a63` (5.83:1), user dark `#767676`, user light `#868686`.
- **B-064** — Theme variable reconciliation. Added the 2 consumed-but-undefined vars (`--theme-radius-input`, `--theme-text-on-accent`) to all 7 theme files; back-filled `--theme-badge-neutral-bg`/`-text` (4 files) and `--theme-table-*` (user theme); deleted 25 defined-but-unused vars. Scripted audit now reports **0 consumed-but-undefined** and **0 defined-but-unused** across all themes. DESIGN.md accent table updated to drop the un-consumed `--theme-accent-hover` column.
- **B-077** — Verified already gated: `checkbox-anim.js` early-returns when `prefers-reduced-motion: reduce` (present since commit e6a80260).

## Validation gate (all green)
- tailwindcss rebuild (`styles.css` regenerated from `tw.css`): OK
- tsc (main + prisma + tui): pass
- vitest: 224/224
- EJS compile: 75/75
- `eslint src`: exactly at pre-existing baseline (544 errors / 1167 warnings)
- impeccable detector: 0 findings
- Scripted var audit: 0 consumed-but-undefined, 0 defined-but-unused
