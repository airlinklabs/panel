# Phase 3 Report — Responsive layout overhaul and mobile-first rearrangement

**Status:** COMPLETE — validation gate passed. Auto-proceeding to Phase 4 after a 10s pause per coordinator instruction.

## Scope

Fix the responsive/overflow bug ledger (B-040..B-053, B-056, B-057), audit every major layout for overflow and mobile usability, and verify the critical pages (dashboard, manage, files, login, register) behave at small widths. No package substitutions.

## Bugs fixed (ledger statuses updated)

- **B-040 (P0)** api docs sidebar: `api/documentation.ejs` sidebar now `hidden lg:block`; mobile uses bottomNav. Content no longer crushed to ~135px.
- **B-041** `col-hide` columns: added one shared `.col-hide { display:none }` rule to tw.css's 639px block; removed 3 per-view copies (images, store, addons).
- **B-042** schedules collapsible row: `.al-table-card` (auto-applied by al-table.js) re-styled `tr[data-tasks-row]` as a card. Added a CSS exception so collapsible rows keep a plain full-width block.
- **B-043** error page path: `truncate` → `break-all` so long paths wrap.
- **B-044** credits grids: leads `grid-cols-1 sm:grid-cols-3`, contributors `2/3/4`, links `2/4`; content `px-4 sm:px-8`.
- **B-045** nested sheet scroll: sheet bodies that used `flex-grow overflow-y-auto` without `min-h-0` forced the flex parent to overflow too, producing double scrollbars on mobile. All sheet bodies across modal, backups, databases, images, files, apikeys, dashboard, imageViewer, schedules, subusers, mounts now use `flex-1 min-h-0 overflow-y-auto` so the body is the single scroll region at every breakpoint.
- **B-050** bottomNav theme toggle + account link: 36px → 44px minimum.
- **B-051** pagination: page buttons h-9→h-10/min-w-40px, prev/next p-1.5→p-2.
- **B-052** ghost icon buttons: `p-1/p-1.5` → `p-2` and `w-8 h-8`/`w-7 h-7` → `w-9 h-9` across databases, schedules, dashboard, apikeys, sftp, account, servers/edit.
- **B-053** format switcher: `min-height: 0` → `min-height: 40px`.
- **B-057** folder card nested interactive: removed the dead `.folder-menu-btn` (no handler was ever registered; it was a visible-but-inert button on mobile). The card keeps `role="button"` + Enter/Space open-folder behavior.
- **B-056** documented as mitigated: keyboard users can move servers via the server-card context menu (Shift+F10 → Add to folder → folder picker); no new UI required.

## Critical pages mobile pass (dashboard / manage / files / login / register)

Audited all five with the impeccable detector + pattern sweeps. Result: these pages already ship dedicated mobile behavior and needed no structural changes:

- **dashboard**: folder grid `2/3/4`, server grid `1/2/3`, popup grids collapse, cards use `min-w-0` + truncate.
- **manage**: has a full separate mobile layout (`lg:hidden` section) with compact header, meta stack, flex power buttons, IP row with copy + truncate, full-width terminal input, and a 2x2 stats/chart grid.
- **files**: table in `overflow-x-auto` wrapper, non-essential columns `hidden md:table-cell`, action bar `flex-wrap`.
- **login / register**: no overflow markers; register grid already collapses.

Global sweep for fixed-width sidebars, raw tables, oversized `min-w`, and missing `.al-table` wrappers: only analytics/playerstats tables, and both are already inside `overflow-x-auto` containers.

## Files changed

`public/tw.css` (col-hide + tasks-row exception + format-switcher), `views/api/documentation.ejs`, `views/errors/error.ejs`, `views/user/credits.ejs`, `views/user/dashboard.ejs`, `views/user/server/{databases,schedules,files,backups,subusers}.ejs`, `views/admin/{images/images,images/store,addons/addons,apikeys/apikeys,mounts/index,servers/edit}.ejs`, `views/components/{bottomNav,modal,imageViewer,sftp}.ejs`, `views/components/ui/al-pagination.ejs`.

## Validation

- EJS compile check over all 50 changed views — OK.
- Tailwind build (`tw.css → styles.css`) — OK (v4.3.3).
- `tsc` typecheck (all 3 configs) — OK.
- `vitest run` — 224/224 pass.
- Impeccable detector over `views` + `public` — 10 findings total, 0 new. The 5 in changed files are pre-existing: 4 `gray-on-color` pills in nodes/users (files touched only for the earlier toast dedup) and 1 `broken-image` false positive (imageViewer `<img>` gets its src from JS on open).
- `eslint src` — unchanged pre-existing errors only (0 src files modified in this phase).

## Intentional behavior changes

- API docs sidebar is now hidden below `lg` (mobile uses bottom nav) — B-040.
- Folder cards no longer show a (dead) "…" menu button — B-057.
- Sheet modals now scroll in their body region on desktop too (previously some relied on the panel; content that overflowed 85vh could clip). Behavior-equivalent, strictly better containment.

## Remaining risks

- `.al-table-card` auto-upgrade means every table ≥3 columns becomes stacked cards on phones; schedules needed an explicit exception. Any future colspan row must add `data-tasks-row` (or the general exception pattern).
- The `px-8` page-header rows on non-core pages (activity, playerstats, apikeys/docs, images/edit, create-server, file.ejs) remain slightly wide on phones; cosmetic, deferred.
- `admin-nodes.js` still uses raw fetch (documented in Phase 2); unaffected by this phase.

## Next phase readiness

Phase 4 (manage.ejs live data / no-reload) is the next critical interactive phase. The responsive foundations are in place; manage's mobile and desktop layouts both pass inspection. Awaiting the auto-continue trigger.
