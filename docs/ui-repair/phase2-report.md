# Phase 2 Report — Shared component system and common UI primitives

**Status:** COMPLETE — validation gate passed, STOP for instruction.

## Scope

Unify repeated UI concerns into single shared owners; delete dead duplicates; introduce shared primitives for fetch and escaping; migrate callers where the flow is a drop-in. Kept core pages (dashboard, manage, files, login, register) unchanged except for cleanup edits that remove duplication. No package substitutions were made this phase.

## Files changed

### New shared primitives
- `public/javascript/shared/escape.js` — `window.escHtml / escAttr / escJS`.
- `public/javascript/shared/api.js` — `window.api(url, method, body)` fetch wrapper. Returns parsed JSON on success; on HTTP error toasts the server's `error` text; on network failure toasts fixed `'Request failed. Try again?'`; returns `null` in both failure cases.
- Both registered as non-defer scripts in `views/components/header.ejs` (lines 115-116) so they exist before any page inline script runs.

### Shared ownership fixes
- **Toast (B-070):** removed the duplicate `<%- include(...toast) %>` from 39 views. `header.ejs` (`./toast`) is now the sole owner. Grep-verified: 0 direct `components/toast` includes remain.
- **getCsrf (B-084):** removed local `getCsrf` definitions + `'csrf-token': getCsrf()` headers from `backups.ejs`, `files.ejs`, `schedules.ejs` (incl. the `xhr.setRequestHeader('csrf-token', getCsrf())` at files.ejs:1041). CSRF is still injected globally by `js/csrf.js`.
- **pageTitle (B-075/B-065):** deleted `views/components/pageTitle.ejs`; `playerstats.ejs` migrated to `ui/page-header`.

### Inline escape-chain migration (4 views)
`credits.ejs`, `backups.ejs`, `players.ejs`, `2fa-setup.ejs` now use `escHtml` instead of local `replace()` chains. Other inline chains were reviewed and left as-is (escaping already adequate, page-specific content).

### Page JS migration
- `search.js`, `admin-image-store.js`, `admin-image-edit.js`, `admin-servers.js`, `modrinth-admin.js`: delegated local `escHtml` to the shared helper.
- `admin-databases.js`, `admin-settings.js`, `admin-servers.js` (simple delete/toggle flows), plus inline scripts in `subusers.ejs` and `schedules.ejs`: migrated `fetch` to `window.api`.
- **Intentional exceptions (left on raw fetch):** `admin-nodes.js` — the delete flow inspects the error body (`result.error === 'There are instances on the node'`) for a second confirm, which `window.api` swallows; the 15s status poll wants silent failures, not per-tick toasts. Complex admin-servers flows likewise kept as-is.

### Hardcoded SVG migration (B-081)
`databases.ejs` eye/eye-off → `icon('eye')`/`icon('eye-off')`; `toast.ejs` dismiss X → `alIcon('x', 'w-3.5 h-3.5')`.

## Bugs fixed (Phase 2 closure)

Ledger statuses updated in `bug-ledger.md`. Fixed: B-055, B-063 (prior session, verified), B-070, B-076 (prior session, verified), B-079 (prior session, verified), B-081, B-084. Partial: B-054, B-065, B-073, B-075. Deferred: B-071, B-072, B-074, B-082, B-083. Still open: B-078 (missing footer on mounts/index, servers/create, servers/edit — verified).

## Tests run

- `node --check` on all 9 modified/added JS files — all pass.
- EJS compile check (`ejs.compile`) over all 43 changed views — all pass.
- `./node_modules/.bin/tsc --noEmit` + `tsc -p tsconfig.prisma.json --noEmit` + `tsc -p tsconfig.tui.json --noEmit` — **TYPECHECK OK**.
- `./node_modules/.bin/eslint src` — fails, but **all 544 errors / 1169 warnings are pre-existing** in `src/` (0 src files modified in this phase; verified via `git diff --name-only HEAD -- src/`).
- `./node_modules/.bin/tsc && tsc -p tsconfig.prisma.json && tailwindcss -i ./public/tw.css -o ./public/styles.css` — **BUILD OK** (Tailwind v4.3.3).
- `./node_modules/.bin/vitest run` — **224 passed / 20 files**.
- Impeccable detector (`detect.mjs --json`) — 8 findings total; **0 new findings introduced** by this phase's files (the 4 hits in changed files are pre-existing pills at nodes.ejs:128 / users.ejs:76, files touched only for toast-include removal).
- Leftover-reference greps: 0 toast re-includes, 0 `getCsrf`, 0 `pageTitle` refs, 0 local `function api(`.

## Package substitutions

None. Kept existing dependencies (lucide via `icon()`/`alIcon`, no new packages). No package was replaced with custom code and no custom code was replaced with a new package.

## Intentional behavior changes

1. **Toast include dedup (B-070):** toast markup/script is now emitted exactly once per page (from `header.ejs`) instead of 40x. The `createToastSystem` guard is left in place defensively. Net byte savings per page ≈ 9.5KB; no functional change.
2. **getCsrf removal (B-084):** backups/files/schedules now rely on the global `csrf.js` patch instead of page-local copies. CSRF headers are still sent on those requests.
3. **api.js toast semantics:** unified fetch wrapper toasts exactly one error per failure — HTTP errors show the server's `error` text, network failures show a fixed friendly message. Previously, migrated sites could double-toast (local code + wrapper). Non-migrated raw-`fetch` sites are unaffected.
4. **Modal confirm default (B-076):** default confirm button is now primary; destructive confirms must pass `danger: true` (they already do at call sites).

## Remaining risks

- Migrated `window.api` sites rely on toast-on-failure side effects; any future raw-fetch migration must audit the "needs the error body" case (as admin-nodes.js does).
- `modrinth-admin.js` and `admin-airlink-cloud-settings.js` remain dead files (defer deletion to Phase 8).
- B-071 (parallel modals) and B-074 (server shell) are the two large deferred consolidations; they are independent of this phase's primitives.
- `pnpm` launcher is broken in this environment (corepack/node 22 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`); all commands were run via `node_modules/.bin` directly. No project issue.

## Next phase readiness

Ready for Phase 3 (responsive layout overhaul). The shared component base now has clear single owners for toast, fetch, escaping, and icons; no Phase 2 carry-over blocks Phase 3.

STOP — awaiting instruction.
