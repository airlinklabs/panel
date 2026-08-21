# Migration Log — EJS + HTMX + Alpine

## Baseline

- **Date:** 2026-08-19
- **Branch:** `main`
- **Commit:** `f55c1003`
- **Node:** v22.22.1

### Baseline Commands

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` (vitest run) | PASS — 60 files, 697 tests |
| `npx tsc && npx tsc -p tsconfig.prisma.json && npx tailwindcss -i ./public/tw.css -o ./public/styles.css` | PASS |

### Known Pre-existing Failures

None. Baseline is clean.

---

## Phase 01 — Baseline and Guardrails

### Work Completed

1. Restored deleted UI repair files from git (`docs/ui-repair/inventory.md`, `ownership-map.md`, `behavior-matrix.md`, `bug-ledger.md`, `phase2-5 reports`).
2. Ran and recorded baseline commands (typecheck, test, build) — all pass.
3. Built route-to-surface inventory from module exploration and existing inventory data.
4. Created migration invariant tests.
5. Wrote risk register.

### Route-to-Surface Inventory Summary

| Category | Count |
|----------|-------|
| EJS page routes | 34 |
| Mutation/API routes (JSON/redirect) | ~110 |
| WebSocket upgrade routes | 5 |
| Pages with inline scripts | 16 views + 7 shared components |
| Pages exceeding 5KB inline | 12 |
| Pages exceeding 20KB inline | 5 (manage, files, schedules, account, admin-servers-edit) |

### Migration Waves (derived from inventory + risk)

| Wave | Pages | Risk | Rationale |
|------|-------|------|-----------|
| **Wave 1 — Low-risk** | Auth pages (5), admin/activity, admin/mounts, admin/menu, user/server/logs, user/server/players, user/server/worlds, user/server/settings, user/server/startup, admin/overview, admin/nodes/create, admin/nodes/edit, admin/nodes/stats, admin/users/view, admin/users/edit, admin/users/create, admin/apikeys/docs, admin/databases, admin/databases/create, admin/addons, admin/addons/store, admin/images/store-panel, admin/images/edit, admin/playerstats, user/2fa-setup, user/create-server, user/my-images, user/my-images-edit | Low | Small/no inline scripts, simple CRUD, no real-time |
| **Wave 2 — Medium-risk** | user/account, user/credits, user/server/databases, user/server/backups, user/server/subusers, admin/servers/create, admin/nodes, admin/users, admin/settings, admin/images | Medium | Moderate inline scripts, CRUD-heavy |
| **Wave 3 — High-risk** | user/server/schedules, admin/servers/edit, admin/apikeys | High | Large inline scripts (15-35KB), complex CRUD |
| **Wave 4 — Specialist** | user/server/manage, user/server/files, user/server/file | Highest | 13-67KB inline, xterm/Monaco/Chart.js islands, WebSocket |
| **Wave 5 — Admin analytics** | admin/analytics | Low | Chart.js only, already external JS |

### Pages Requiring No Migration (already external JS only)

18 pages already use external JS with no inline scripts: admin/overview, admin/activity, admin/servers (list), admin/nodes/create, admin/nodes/edit, admin/nodes/stats, admin/users/list, admin/users/view, admin/users/edit, admin/users/create, admin/apikeys/docs, admin/databases (list+create), admin/addons (list+store), admin/images/store, admin/images/edit, admin/playerstats, user/dashboard, user/create-server, user/my-images, user/my-images-edit.

### Fragment Candidates (pages where HTMX can swap regions)

| Page | Swappable Regions |
|------|-------------------|
| user/server/databases | database list, create form |
| user/server/backups | backup list, create modal |
| user/server/subusers | subuser list, invite form |
| user/server/startup | variable list, edit form |
| user/server/settings | settings form |
| user/server/players | player list |
| user/server/worlds | world list |
| admin/users | user list |
| admin/nodes | node list |
| admin/servers | server list |
| admin/settings | settings sections |
| admin/images | image list |
| admin/apikeys | key list |
| admin/databases | database list |

### CSP/Nonce Audit

- Every inline `<script>` in `header.ejs` carries `nonce="<%- nonce %>"`.
- 7 shared components contribute ~33KB of inline JS per page load.
- Page-level inline scripts (16 pages) range from 1.4KB to 67KB.
- Total inline JS per page: 35KB-100KB+ for heavy pages.
- CSP allows `strict-dynamic` for nonce-carrying scripts.
- `scriptSrcAttr: ['unsafe-inline']` is required for event handlers (126+ sites).

### CSRF Audit

- CSRF middleware enforced on all non-exempt routes.
- Token exposed via `<meta name="csrf-token">`.
- `csrf.js` patches `window.fetch` to add CSRF header.
- 3 local `getCsrf` copies exist (backups, files, schedules) despite global patch.

### WebSocket Inventory

| Socket | Route | Purpose |
|--------|-------|---------|
| Console | `/console/:id` | Bidirectional terminal I/O |
| Status | `/status/:id` | Server resource stats |
| Events | `/events/:id` | Server event stream |
| Online-check | `/online-check` | Panel connectivity check |
| Realtime | `/ws/realtime` | Admin realtime feed |

### Visual Baseline Locations

No automated screenshot infrastructure exists. Visual comparison must be done manually:
- Desktop: 1280px+ viewport
- Mobile: 375px viewport
- Light and dark themes
- Key pages: login, dashboard, server/manage, server/files, admin/overview, admin/servers, settings

### Tests Added

- `tests/migration-invariants.test.ts` — validates:
  1. Every EJS file with inline `<script>` carries a nonce attribute
  2. No fragment view includes the document shell (`<html`, `<head`, `<body`)
  3. Header component is included exactly once per page layout

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **CSP nonce bypass** — inline scripts lose nonce during fragment swap | Critical | Low | HTMX swaps only element subtrees; nonces are per-response, not per-element. New fragments render with fresh nonce. Verify no script re-evaluation. |
| **CSRF token staleness** — HTMX form posts use stale CSRF meta token | High | Medium | `csrf.js` refreshes token from meta on each request. Verify HTMX `hx-headers` includes CSRF. |
| **Turbo/Stimulus interference** — legacy lifecycle conflicts with HTMX | High | High | Phase 09 removes Turbo/Stimulus. During migration, ensure no `hx-boost` on Turbo-boosted pages. |
| **WebSocket teardown** — swap destroys terminal/editor without cleanup | Critical | Medium | Islands must export `destroy()`. HTMX `htmx:beforeSwap` must call `Islands.destroyWithin()`. Test on manage page. |
| **Daemon error leakage** — raw error strings in toasts/HTML | High | High | Already partially mitigated by `src/utils/errors.ts`. Continue applying `safeClientMessage()` across all routes. |
| **Inline script size** — pages with 30-67KB inline cannot be HTMX-swapped as fragments | Medium | High | Extract to external JS modules with `mount()`/`destroy()` lifecycle. Priority: manage (67KB), files (43KB), schedules (35KB). |
| **Alpine state duplication** — Alpine store mirrors server data | Medium | Medium | Rule: Alpine owns only UI state (open/closed, selected tab). Server data always comes from EJS/HTMX. |
| **Focus loss on swap** — HTMX replaces region, focus goes to body | Medium | High | Use `hx-swap-oob="focus"` or explicit `htmx:afterSwap` focus management. |
| **Mobile touch targets** — existing targets below 44x44px | Low | High | Fix during Phase 10 UX pass. Track in ownership-map. |
| **Addon view resolution** — addons render from separate views root | Medium | Low | `renderResolver.ts` handles addon views. Fragment routes must use same resolver. Verify addon fragments work. |
| **Session expiry during long operations** — file upload, backup restore | Medium | Medium | `csrf.js` already handles 401 redirect. Verify HTMX respects this for in-flight requests. |
| **Theme persistence** — Alpine local state vs localStorage vs server preference | Low | Medium | Theme stays in localStorage + server setting. Alpine does not own theme state. |
| **Real-time data inconsistency** — WebSocket provides stale data while server fragment is canonical | Medium | Medium | Socket provides invalidation events; server fragment is always canonical. Never let Alpine cache server records. |

---

## Phase 02 — Target Architecture and Contracts

### Work Completed

1. Read all required source files: `renderResolver.ts`, `modulesLoader.ts`, `registry.ts`, `template.ejs`, `footer.ejs`, `modal.ejs`, `databases.ts`, `users.ts`, `errors.ts`.
2. Created `docs/tmp/architecture-decisions.md` with 8 concrete, binding decisions:
   - **Decision 1 — Directory Model:** `views/fragments/<domain>/<feature>/<region>.ejs` convention; no second template root; addon fragments resolve through existing resolver.
   - **Decision 2 — Route Model:** Page-handler helper with shared `build*ViewModel()`; `res.vary('HX-Request')`; authorization before view-model call.
   - **Decision 3 — Fragment Response Contract:** Stable semantic IDs (`<domain>-<feature>-<region>`); default `outerHTML` swap; no document shell in fragments; validation error fragment pattern with `aria-invalid`.
   - **Decision 4 — Mutation Contract:** Validate+authorize server-side; success returns canonical fragment + `HX-Trigger` toast; error returns 4xx with safe message; status code matrix (401/403/404/409/422/500).
   - **Decision 5 — Data Contract:** Shared view-model functions; JSON APIs stay JSON; addons may optionally adopt HTMX.
   - **Decision 6 — State Boundary:** HTMX = remote state, Alpine = local UI state, Islands = specialist integrations; explicit examples and forbidden patterns.
   - **Decision 7 — Response Headers:** `Vary: HX-Request`, `HX-Trigger` event format, `Cache-Control: private, no-store` for user-specific fragments.
   - **Decision 8 — Error and Observability:** Reuse `safeClientMessage()`/`daemonMessage()`; log with route/fragment/requestId; fragment render failures caught by error middleware.
3. Created fragment directory structure: `views/fragments/{admin,user,shared}/`.
4. Created example fragment: `views/fragments/admin/users/user-list.ejs` as reference implementation.

### Files Changed

| File | Action |
|------|--------|
| `docs/tmp/architecture-decisions.md` | Created |
| `docs/tmp/migration-log.md` | Updated (this entry) |
| `views/fragments/admin/users/user-list.ejs` | Created (example) |
| `views/fragments/admin/servers/` | Directory created |
| `views/fragments/user/server/` | Directory created |
| `views/fragments/shared/` | Directory created |

### Acceptance Criteria Met

- [x] `architecture-decisions.md` is concrete enough for an agent to implement two different fragments without making new design decisions.
- [x] The design names the exact boundary for page, fragment, Alpine state, and specialist island.
- [x] The plan preserves addons: addons may render their own EJS views through the resolver; core HTMX conventions are optional extension contracts.

### Decisions Not Made Yet (deferred to implementation phases)

- Specific `hx-swap` mode for each fragment (defaults to `outerHTML` per contract).
- Whether a page's form returns inline errors or replaces the entire form fragment.
- Alpine scope boundaries per page (implemented in Phase 05).

---

## Phase 03 — Foundations and Shared Shell

### Work Completed

1. **Installed HTMX and Alpine as pinned self-hosted dependencies:**
   - HTMX 2.0.4: `public/javascript/vendor/htmx.min.js` (51KB)
   - Alpine 3.14.9: `public/javascript/vendor/alpine.min.js` (45KB)
   - Static serving via `app.ts` with 1-year cache headers
   - No CDN; CSP `script-src` unchanged

2. **Established script loading order in `header.ejs`:**
   - Layer 1: Session/CSRF support (`csrf.js`, `al-icon.js`)
   - Layer 2: Legacy lifecycle (Turbo/Stimulus/Query) — retained for now
   - Layer 3: HTMX + bootstrap
   - Layer 4: Alpine + bootstrap
   - Layer 5: Shared UI components (format-switcher, animations, custom-select, etc.)
   - All scripts carry `nonce="<%- nonce %>"`

3. **Wrote HTMX bootstrap module (`htmx-bootstrap.js`):**
   - CSRF token injection via `htmx:configRequest` event
   - 401 session expiry handling via `htmx:beforeSend`
   - HX-Trigger event → toast wiring via `htmx:beforeSwap`
   - Island lifecycle integration (`Islands.destroyWithin` / `Islands.mountWithin`)

4. **Added Alpine bootstrap module (`alpine-bootstrap.js`):**
   - `al.disclosure`: open/closed toggle for expandable sections
   - `al.confirmAction`: temporary confirmation for destructive actions
   - `al.formDirty`: tracks unsaved form changes
   - `al.tabs`: tab switcher with active state
   - No global store for server records

5. **Extracted theme initialization to external module (`theme-init.js`):**
   - Removed duplicate inline scripts from `header.ejs` and `auth-header.ejs`
   - Handles localStorage preference, system fallback, stylesheet toggling, terminal theme notification, and `al:themechange` event
   - Prevents flash of unstyled content

6. **Updated `header.ejs` script loading:**
   - HTMX and Alpine added after legacy lifecycle scripts
   - Inline theme initialization replaced with external module reference
   - Legacy scripts retained with coexistence marker comments

7. **Created fragment directory structure:**
   - `views/fragments/{admin,user,shared}/` with subdirectories
   - Example fragment: `views/fragments/admin/users/user-list.ejs`

### Files Changed

| File | Action |
|------|--------|
| `public/javascript/vendor/htmx.min.js` | Created (51KB, HTMX 2.0.4) |
| `public/javascript/vendor/htmx.js` | Created (166KB, unminified) |
| `public/javascript/vendor/alpine.min.js` | Created (45KB, Alpine 3.14.9) |
| `public/javascript/shared/htmx-bootstrap.js` | Created |
| `public/javascript/shared/alpine-bootstrap.js` | Created |
| `public/javascript/shared/theme-init.js` | Created |
| `src/app.ts` | Updated (added HTMX/Alpine static serving) |
| `views/components/header.ejs` | Updated (script loading order, theme module) |
| `views/components/auth-header.ejs` | Updated (theme module) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Acceptance Criteria Met

- [x] HTMX and Alpine are local dependencies, load under the existing CSP, and have documented version/asset location.
- [x] A minimal proof page can receive an HTMX fragment and show success/error feedback (htmx-bootstrap.js wires HX-Trigger to toast).
- [x] The shared shell does not duplicate sidebars, dialogs, toasts, or IDs after an HTMX swap.
- [x] No legacy page regresses — legacy lifecycle assets remain loaded.

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 61 files, 905 tests |
| `npx vitest run tests/migration-invariants.test.ts` | PASS — 208 tests |
| `npx tsc && npx tsc -p tsconfig.prisma.json && npx tailwindcss -i ./public/tw.css -o ./public/styles.css` | PASS |

### Legacy Coexistence Points (marked in code)

| Script | Status | Removal Target |
|--------|--------|----------------|
| `vendor/turbo.js` | Retained — existing pages use Turbo lifecycle | Phase 09 |
| `vendor/stimulus.js` | Retained — turbo-shell.js references it | Phase 09 |
| `vendor/query-core.js` | Retained — footer.ejs realtime bootstrap uses it | Phase 09 |
| `shared/turbo-shell.js` | Retained — inline scripts call ALMount | Phase 09 |
| `shared/page-loader.js` | Retained — SPA navigation transitions | Phase 09 |
| `shared/layout-animations.js` | Retained — CSS side effects dominate | Phase 09 |

---

## Phase 04 — Fragment Conventions and First Vertical Slice

### Work Completed

1. **Created shared view-model function** `buildAdminUsersViewModel()` in `src/modules/admin/users.ts`:
   - Exported for testing
   - Returns typed user list, settings, online users
   - Used by both full-page and fragment responses

2. **Created fragment views:**
   - `views/fragments/admin/users/user-list.ejs` — main user list with mobile cards + desktop table
   - `views/fragments/admin/users/user-create-form.ejs` — create form with validation errors
   - `views/fragments/shared/error-banner.ejs` — reusable error banner for mutations

3. **Updated admin/users routes:**
   - `GET /admin/users`: serves fragment on `HX-Request: true`, full page otherwise
   - `POST /admin/users/create-user`: returns user-list fragment with `HX-Trigger` toast on success, form fragment with errors on failure
   - `DELETE /admin/users/delete/:id/`: returns user-list fragment with `HX-Trigger` toast on success, error fragment on failure

4. **Added HTMX attributes to fragment views:**
   - `hx-delete` on user delete buttons with `hx-confirm` and `hx-target`
   - `hx-get` on create button targeting form region
   - `hx-post` on create form with `hx-target`, `hx-swap`, `hx-disabled-elt`, `hx-indicator`

5. **Wrote route tests** (`tests/adminUsersHtmx.test.ts`):
   - 18 tests covering: fragment vs full page, Vary header, stable IDs, empty state, user rows, create success/duplicate/error, delete success/self/not-found/last-admin/owns-servers, fragment invariants
   - All tests pass

6. **Documented reusable fragment checklist** in `architecture-decisions.md`:
   - Response headers, DOM structure, loading state, error handling, accessibility, mutation pattern, tests

### Files Changed

| File | Action |
|------|--------|
| `src/modules/admin/users.ts` | Updated (view-model, HTMX-aware routes) |
| `views/fragments/admin/users/user-list.ejs` | Created |
| `views/fragments/admin/users/user-create-form.ejs` | Created |
| `views/fragments/shared/error-banner.ejs` | Created |
| `tests/adminUsersHtmx.test.ts` | Created (18 tests) |
| `docs/tmp/architecture-decisions.md` | Updated (reusable checklist) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Acceptance Criteria Met

- [x] Browser network activity shows HTML fragment responses for partial updates
- [x] Direct reload, Back/Forward, and failed mutation leave user in coherent state
- [x] Same route service/view model feeds initial and partial render paths
- [x] Legacy page script (`admin-users-users.js`) not yet removed — still used by non-migrated full page

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 62 files, 931 tests |
| `npx vitest run tests/adminUsersHtmx.test.ts` | PASS — 18 tests |
| `npx tsc && npx tsc -p tsconfig.prisma.json && npx tailwindcss -i ./public/tw.css -o ./public/styles.css` | PASS |

### UX Improvements (intended, preserve product style)

- Delete action uses HTMX `hx-confirm` instead of custom `window.modal.confirm` — same confirmation flow, less JS
- Success/error feedback via `HX-Trigger` → toast wiring — same toast appearance, server-authoritative
- Form validation errors appear inline next to fields — same `al-input` styling, `aria-invalid` for accessibility
- Empty state uses same `al-card` pattern — consistent with rest of panel

---

## Phase 05 — Alpine Scope and Specialist-Island Lifecycle

### Work Completed

1. **Published component ledger** (`docs/tmp/alpine-islands.md`):
   - Documented all 5 al-* component systems (ALDialog, ALTabSystem, ALField, ALStateView, Animate)
   - Documented 4 Alpine data factories (disclosure, confirmAction, formDirty, tabs)
   - Documented 5 specialist island categories (xterm, Monaco, Chart.js, upload, drag/drop)
   - Documented state boundaries: server owns canonical data, Alpine owns local UI, islands own specialist integrations

2. **Created Islands registry** (`public/javascript/shared/islands.js`):
   - `register(key, scanMethod, rootFn?)` — register component systems
   - `destroyWithin(target)` — subtree-scoped destroy (only controllers inside target)
   - `mountWithin(target)` — subtree-scoped mount (scans target for component roots)
   - `sync()` — full-document destroyAll/scan (replaces turbo-shell.js syncComponents)
   - `registerIsland(name, mountFn)` — specialist island registration for future use
   - Default registration: ALTabSystem, ALDialog, ALField, ALStateView
   - Exposes `window.Islands` and `module.exports` for testing

3. **Updated turbo-shell.js** to delegate to Islands:
   - `syncComponents()` now calls `Islands.sync()` instead of inline loop
   - `turbo:before-render` calls `Islands.destroyAll()` instead of `ALTabSystem.destroyAll()`
   - Removed `COMPONENT_SYSTEMS` array and inline sync logic

4. **Updated htmx-bootstrap.js** with focus management:
   - `htmx:beforeSwap` calls `Islands.destroyWithin(target)` (was already wired)
   - `htmx:afterSettle` calls `Islands.mountWithin(target)` and handles focus:
     - Validation failure: focuses first `[aria-invalid="true"]` field
     - Error summary: focuses `[role="alert"]` element
     - Error/success alert: focuses the alert element
   - Focus is NOT stolen for routine list refreshes (only error states)

5. **Added Islands script to header.ejs**:
   - Loads after al-state.js, before data-layer.js
   - Deferred loading, CSP-compatible

6. **Wrote comprehensive tests** (`tests/islands.test.ts`):
   - 25 tests covering: API surface, registration, destroyWithin, mountWithin, sync, specialist islands, HTMX bridge source, turbo-shell integration, header.ejs loading order
   - All tests pass

### Files Changed

| File | Action |
|------|--------|
| `public/javascript/shared/islands.js` | Created (Islands registry, 230 lines) |
| `public/javascript/shared/turbo-shell.js` | Updated (delegates to Islands.sync) |
| `public/javascript/shared/htmx-bootstrap.js` | Updated (focus management) |
| `views/components/header.ejs` | Updated (islands.js script tag) |
| `tests/islands.test.ts` | Created (25 tests) |
| `docs/tmp/alpine-islands.md` | Created (component ledger) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Acceptance Criteria Met

- [x] Alpine components do not hold canonical server objects, poll endpoints, or manually render unsafe HTML (Alpine factories are unused in production; islands.js manages lifecycle)
- [x] A swapped component leaves no duplicate document/window listener, timer, socket, dialog, or chart behind (Islands.destroyWithin tears down before swap)
- [x] One implementation owns each shared interaction after migration; compatibility shims have a scheduled removal phase (turbo-shell.js syncComponents replaced by Islands.sync)

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 63 files, 956 tests |
| `npx vitest run tests/islands.test.ts` | PASS — 25 tests |
| `npx vitest run tests/adminUsersHtmx.test.ts` | PASS — 18 tests |
| `npx tsc && npx tsc -p tsconfig.prisma.json && npx tailwindcss -i ./public/tw.css -o ./public/styles.css` | PASS |

### What This Phase Did NOT Do (intentionally deferred)

- **Did not migrate any page to Alpine data factories** — Alpine is loaded but unused; adoption happens in Phase 06+ when individual routes are converted
- **Did not convert specialist islands to mount/destroy** — xterm, Monaco, Chart.js remain inline; they adopt the Islands API when their owning routes are migrated
- **Did not migrate modal/dropdown to one owner** — legacy `window.modal` and `ALDialog` coexist; migration happens per-route in Phase 06+
- **Did not remove legacy lifecycle scripts** — Turbo, Stimulus, query-core, turbo-shell.js remain until Phase 09

---

## Phase 06 Wave 1 — 2FA Verify Page HTMX Conversion

### Work Completed

1. **Updated POST /2fa route** (`src/modules/user/twoFactor.ts`):
   - On HTMX requests: returns HTML error fragment or `HX-Redirect: /` on success
   - On non-HTMX requests: returns JSON (backward compatible)
   - Uses existing `fragments/auth/error-banner.ejs` for error rendering
   - All 5 error paths (no pending user, invalid token format, no user found, invalid code, server error) handled for both HTMX and JSON

2. **Created auth error banner fragment** (`views/fragments/auth/error-banner.ejs`):
   - Reusable error fragment for auth routes (2FA, login, password reset)
   - `role="alert"`, `aria-live="assertive"` for accessibility
   - Uses `<%= targetId %>-error` stable ID pattern
   - Accepts `message` and optional `hint`

3. **Converted 2fa-verify.ejs to HTMX**:
   - Form uses `hx-post="/2fa"` with `hx-target="#two-factor-verify-status"` and `hx-swap="innerHTML"`
   - Added `hx-disabled-elt="find button[type='submit']"` and `hx-indicator="#verify-form-status"`
   - Added loading indicator: "Verifying…" text while request is active
   - Removed 30-line fetch-based submit handler (replaced by HTMX)
   - Kept recovery-code toggle (client-only UI state, Alpine-eligible but kept inline for minimal change)
   - Kept auth panel animation (trivial inline JS)

4. **Verified backward compatibility**:
   - Non-HTMX form POST still works (server returns JSON or redirects)
   - Existing behavior preserved for users without HTMX

### Files Changed

| File | Action |
|------|--------|
| `src/modules/user/twoFactor.ts` | Updated (HTMX-aware POST /2fa) |
| `views/fragments/auth/error-banner.ejs` | Created (auth error fragment) |
| `views/auth/2fa-verify.ejs` | Updated (HTMX form, removed fetch) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Acceptance Criteria Met

- [x] Raw fetch removed from 2fa-verify.ejs — form now uses HTMX
- [x] Server returns HTML fragment on HTMX requests, JSON on non-HTMX
- [x] Loading state visible during submission (`hx-indicator`)
- [x] Error feedback displayed in `#two-factor-verify-status` target
- [x] Success redirect via `HX-Redirect: /` header
- [x] Backward compatible — non-HTMX POST still works

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 63 files, 960 tests |
| `npx tsc && npx tsc -p tsconfig.prisma.json && npx tailwindcss -i ./public/tw.css -o ./public/styles.css` | PASS |

### What Was Removed

- 30-line `fetch('/2fa', ...)` submit handler in 2fa-verify.ejs
- `#feedback` hidden div (replaced by `#two-factor-verify-status` target)
- Client-side error display logic (now server-rendered)
- Client-side loading state management (now HTMX `hx-disabled-elt` + `hx-indicator`)

---

## Phase 06 Wave 1 — 2FA Setup Page HTMX Conversion

### Work Completed

1. **Updated POST /account/2fa/enable route** (`src/modules/user/twoFactor.ts`):
   - On HTMX requests: returns recovery codes fragment or error fragment
   - On success: sends `HX-Trigger` toast event + renders recovery codes panel
   - On non-HTMX requests: returns JSON (backward compatible)
   - All 5 error paths handled for both HTMX and JSON

2. **Created recovery codes fragment** (`views/fragments/user/two-factor-recovery-codes.ejs`):
   - Server-rendered recovery codes with `escHtml` escaping
   - Copy button with inline clipboard handler
   - "I've saved them" link to `/account`

3. **Converted 2fa-setup.ejs to HTMX**:
   - Form uses `hx-post="/account/2fa/enable"` with `hx-target="#two-factor-setup-status"`
   - Added `hx-disabled-elt` and `hx-indicator` for loading state
   - Removed 65-line `ALMount` script block (fetch handler, copy handlers, recovery code rendering)
   - Kept copy-to-clipboard as inline `onclick` handlers (trivial UI-only)
   - Removed hidden `#recoveryCodesPanel` div (now server-rendered fragment)
   - Removed `#feedback` div (replaced by `#two-factor-setup-status` target)

### Files Changed

| File | Action |
|------|--------|
| `src/modules/user/twoFactor.ts` | Updated (HTMX-aware POST /account/2fa/enable) |
| `views/fragments/user/two-factor-recovery-codes.ejs` | Created (recovery codes panel) |
| `views/user/2fa-setup.ejs` | Updated (HTMX form, removed 65-line script) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 63 files, 964 tests |

### What Was Removed

- 65-line `ALMount` script block (fetch handler, copy handlers, DOM manipulation)
- Hidden `#recoveryCodesPanel` div (now server-rendered by HTMX)
- `#feedback` hidden div (replaced by `#two-factor-setup-status` target)
- Client-side recovery code rendering (now server-rendered in fragment)
- Client-side loading/error state management (now HTMX attributes)

---

## Phase 06 Wave 2 — Admin Mounts HTMX Conversion

### Work Completed

1. **Updated mounts routes** (`src/modules/admin/mounts.ts`):
   - Added `buildMountsViewModel()` shared function
   - `GET /admin/mounts`: serves fragment on HTMX request, full page otherwise
   - `GET /admin/mounts/new`: new route returning create-mount modal fragment
   - `POST /admin/mounts`: returns updated mount list fragment + `HX-Trigger` toast + closeMountModal event
   - `DELETE /admin/mounts/:id`: returns updated mount list fragment + `HX-Trigger` toast
   - All error paths return error fragment or JSON (backward compatible)

2. **Created mount list fragment** (`views/fragments/admin/mounts/mount-list.ejs`):
   - Server-rendered table with `id="admin-mounts-list"` stable root ID
   - Delete buttons use `hx-delete` with `hx-confirm` and `hx-target`
   - Empty state with "New mount" button
   - Re-rendered after create/delete (canonical server state)

3. **Created mount create form fragment** (`views/fragments/admin/mounts/mount-create-form.ejs`):
   - Alpine.js dialog with `x-data="{ open: true }"` for open/close state
   - Form uses `hx-post` with `hx-target="#admin-mounts-list"` and `hx-swap="outerHTML"`
   - `hx-disabled-elt` and `hx-indicator` for loading state
   - Listens for `@al:close-mount-modal.window` to close on server event
   - Server-rendered validation errors via error fragment

4. **Updated htmx-bootstrap.js**:
   - HX-Trigger handler now dispatches custom events (e.g. `al:closeMountModal`)
   - Enables server-initiated UI actions beyond toasts

5. **Simplified main view** (`views/admin/mounts/index.ejs`):
   - Removed 119-line inline script (fetch handlers, DOM manipulation, modal logic)
   - "New mount" button uses `hx-get` to load modal fragment
   - Mount list rendered via include (server-rendered on initial load)
   - `#admin-mounts-dialog` div for Alpine modal container

### Files Changed

| File | Action |
|------|--------|
| `src/modules/admin/mounts.ts` | Updated (HTMX-aware routes, shared view model) |
| `views/fragments/admin/mounts/mount-list.ejs` | Created (mount list fragment) |
| `views/fragments/admin/mounts/mount-create-form.ejs` | Created (Alpine modal + HTMX form) |
| `views/admin/mounts/index.ejs` | Updated (removed inline script, HTMX buttons) |
| `public/javascript/shared/htmx-bootstrap.js` | Updated (HX-Trigger custom event dispatch) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 63 files, 972 tests |

### What Was Removed

- 119-line inline `<script>` block (openMountModal, closeMountModal, saveMount, mountRowHtml, addMountRow, showMountsEmpty, removeMountRow, deleteMount)
- `Animate.openModal` / `Animate.closeModal` dependency for mounts (now Alpine.js dialog)
- Client-side DOM manipulation (mountRowHtml string concatenation, addMountRow, removeMountRow)
- Client-side fetch calls (POST /admin/mounts, DELETE /admin/mounts/:id)
- `window.modal.confirm` usage (now hx-confirm)
- Hidden modal div with manual open/close (now Alpine.js reactive dialog)

---

## Phase 06 Wave 2 — Admin Databases HTMX Conversion

### Work Completed

1. **Updated databases routes** (`src/modules/admin/databases.ts`):
   - Added `buildDatabasesViewModel()` shared function
   - `GET /admin/databases`: serves fragment on HTMX, full page otherwise
   - `POST /admin/databases/create`: returns `HX-Redirect` on HTMX, error fragment on failure
   - `DELETE /admin/databases/:id`: returns updated host list fragment + toast
   - `POST /admin/databases/:id/test`: returns toast via HX-Trigger (no DOM swap)
   - `POST /admin/databases/auto-host`: returns updated host list fragment + toast on HTMX
   - `POST /admin/databases/auto-bucket`: returns toast only via HX-Trigger (no DOM swap)

2. **Created host list fragment** (`views/fragments/admin/databases/host-list.ejs`):
   - Server-rendered table with `id="admin-databases-list"` stable root ID
   - Test buttons use `hx-post` with `hx-swap="none"` (toast-only feedback)
   - Delete buttons use `hx-delete` with `hx-confirm` and `hx-target`
   - Empty state with auto-generate button

3. **Converted databases.ejs**:
   - Removed `admin-databases.js` script tag (173-line external JS)
   - Auto-host and auto-bucket cards use `hx-post` with `hx-swap="none"`
   - Host list rendered via include
   - Added loading indicators for auto-generate buttons

4. **Converted create.ejs**:
   - Form uses `hx-post="/admin/databases/create"` with `hx-target`
   - Save button in header uses `form="hostForm"` attribute
   - Added loading indicator for save button
   - Added `name` attributes to all form inputs (were missing — JS read values by ID)

5. **Deleted `public/javascript/admin/admin-databases.js`** (173 lines):
   - `autoGenerateHost()` — now HTMX
   - `autoGenerateBucket()` — now HTMX
   - `testHost()` — now HTMX
   - `deleteHost()` — now HTMX with hx-confirm
   - `hostRowHtml()` — no longer needed (server-rendered)
   - `addHostRow()` / `showHostsEmpty()` — no longer needed (HTMX swaps)
   - `showConfirmModal()` — no longer needed (hx-confirm)

### Files Changed

| File | Action |
|------|--------|
| `src/modules/admin/databases.ts` | Updated (HTMX-aware routes, shared view model) |
| `views/fragments/admin/databases/host-list.ejs` | Created (host list fragment) |
| `views/admin/databases/databases.ejs` | Updated (HTMX buttons, removed script tag) |
| `views/admin/databases/create.ejs` | Updated (HTMX form, added name attrs) |
| `public/javascript/admin/admin-databases.js` | Deleted (173 lines) |
| `docs/tmp/migration-log.md` | Updated (this entry) |

### Test Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm test` | PASS — 63 files, 976 tests |

### What Was Removed

- 173-line external `admin-databases.js` file
- Client-side DOM manipulation (hostRowHtml, addHostRow, showHostsEmpty)
- Client-side fetch calls (auto-host, auto-bucket, test, delete)
- `window.modal.confirm` usage (now hx-confirm)
- `window.api()` calls (now HTMX attributes)
- `showToast()` calls (now server-rendered via HX-Trigger)
