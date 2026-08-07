# Phase 8 Report — Cleanup Verification + Test Coverage (B-075, coverage note)

## Goal
Verify the remaining cleanup items (dead JS files) and add test coverage per the ledger's coverage note.

## Finding: B-075 premise was wrong
The prior audit concluded `public/javascript/admin/modrinth-admin.js` and `public/javascript/admin/admin-airlink-cloud-settings.js` were unreferenced dead files. That scan covered only `views/`, `public/`, and `src/` — it excluded `storage/addons/`. Re-verification shows:

- `storage/addons/modrinth/views/admin.ejs:195` → `<script src="/javascript/admin/modrinth-admin.js">`
- `storage/addons/airlink-cloud/views/settings.ejs:62` → `<script src="/javascript/admin/admin-airlink-cloud-settings.js">`

Both files are live dependencies of disabled-but-shipped addons. **Not deleted.** Every admin/shared JS file was re-scanned (including `storage/addons/`) and all have ≥1 reference. Ledger B-075 corrected to reflect this.

## Deliverables
1. **`tests/errors.test.ts` (new, 19 tests)** — error sanitization contract for `src/utils/errors.ts`:
   - `rawErrorMessage` extraction from Error/string/object/other.
   - `sanitizeError`/`safeClientMessage`: never leak internals (IPs, ports, users, paths) in the safe message; raw detail retained in `debug` for logs; category classification (daemon/database/filesystem/network/unknown); caller fallback precedence.
   - `daemonMessage`: trusted daemon structured `error`/`message` relayed verbatim; non-string/empty/null rejected; trimming.
   - `errorBody`: extracts `.body` off thrown HTTP errors.
   - `isProductionPosture`: unset NODE_ENV = production-safe; development = false; `DEBUG=true` overrides.
2. **`tests/iconVocabulary.test.ts`** — added a regression locking the server-side `icon()` default stroke-width to `1.5` (Phase 7 change).
3. **Marker fix** — `DATABASE_MARKERS` had a typo `'ecnrefused'`; added the correct `'econnrefused'` so real ECONNREFUSED DB errors classify as `database` not `unknown`.

## Validation gate (all green)
- vitest: **244/244** (was 224; +20 new)
- tsc (main + prisma + tui): pass
- EJS compile: 75/75
- `eslint src`: exactly at pre-existing baseline (544 errors / 1167 warnings)
- impeccable detector: 0 findings

## Phase 8 exit
All 8 phases complete. Remaining deferred ledger items (documented): B-013 log redaction, B-071 modal consolidation, B-072 ports listbox, B-074 server-shell dedup, B-082 formatter dedup, B-083 theme-toggle dedup, @formkit/auto-animate declared-but-unused, B-054 ~35 unlabeled inputs, B-065 installHeader/auth-styles hard-coded colors.
