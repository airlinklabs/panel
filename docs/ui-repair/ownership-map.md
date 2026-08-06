# Ownership Map

Phase 1 deliverable. One real owner per repeated UI concern. Decide: owner, consumers, merge, delete, page-specific.

## Decisions

### Buttons
- Owner: `public/tw.css` `.al-btn` family (`.al-btn-primary/.al-btn-secondary/.al-btn-danger`).
- Consumers: 43 views.
- Merge: drop legacy `al-ui-button`/`al-ui-button-primary` aliases (2 uses); `.auth-submit` variant moves to `.al-btn`; kill the 5 hand-rolled `px-4 py-2 text-xs font-medium rounded-xl` inline button strings (modal, sftp, imageViewer, installHeader, portsAllocator).
- Page-specific: none.

### Form controls (input/select/textarea/toggle/checkbox/radio)
- Owner: `public/tw.css` `.al-input`, `.al-label`, `.al-toggle`, `.al-radio`, `.al-checkbox` + `checkbox-anim.js`.
- Consumers: all pages.
- Merge: `.auth-input`/`.auth-submit`/`.cb-box` -> `.al-*`; 7 inline `background:var(--theme-bg-input)` -> `.al-input`; images.ejs bespoke `.field-label/.field-input` -> `.al-*`; base-layer fix for the Tailwind forms plugin (B-063).
- Delete: none.
- Page-specific: none.

### Select / dropdown
- Owner: `public/javascript/shared/custom-select.js` + `.cs-*` classes.
- Consumers: 8 pages.
- Merge: `portsAllocator.ejs` listbox (`pa-extlist`, ~170 LOC) into `custom-select.js`; adopt `@floating-ui/dom` for both positioning engines (or one shared positioning helper).
- Delete: the `pa-extlist` duplicate.
- Page-specific: none.

### Menu / dropdown behavior
- Owner: `custom-select.js` (combobox) + `animations.js` (popup). No separate menu primitive yet.
- Consumers: all pages.
- Merge: create one dropdown/menu primitive on top of the shared popup manager; migrate `bottomNav` More sheet + dashboard folder menus onto it.
- Page-specific: none.

### Modal / dialog
- Owner: `views/components/modal.ejs` (`window.modal`) + `public/javascript/shared/animations.js` (`window.Animate`).
- Consumers: ~44 pages via header.
- Merge: all ~27 `al-sheet-overlay` divs + 3 dashboard `data-[open]` popups + imageViewer/sftp/portsAllocator/admin-images/admin-servers overlays onto this layer. Keep the API, migrate callers.
- Delete: `Animate.openModal` fallback else-branch dead code (47 sites), per-view overlay markup.
- Page-specific: imageViewer content and SFTP content remain page components; their *mechanics* use the shared layer.

### Alerts / banners
- Owner: `views/components/ui/alert.ejs`.
- Consumers: 7 pages.
- Merge: 6 hand-rolled `bg-red-500/10 border-red-500/20` danger banners -> `ui/alert` type=danger.
- Page-specific: installHeader banner (keep, but route colors through `--theme-*`).

### Toasts
- Owner: `views/components/toast.ejs`.
- Consumers: all pages via header.
- Merge: remove the 39 direct re-includes (keep the header include); delete `if (window.createToastSystem) return;` guard.
- Delete: re-include sites.
- Page-specific: none.
- **Phase 2 status: DONE** — 39 re-includes removed; `header.ejs` (`./toast`) is the sole owner. Guard left in place (harmless; defends against future re-include).

### Status pills / badges
- Owner: `views/components/ui/status-badge.ejs`.
- Consumers: dashboard, serverHeader.
- Merge: ~20 hand-rolled `ring-1 ring-inset` pills -> `ui/status-badge`. Fix brittle `s.startsWith('s')` matcher (B-079).
- Page-specific: none.

### Page headers / titles / breadcrumbs
- Owner: `views/components/ui/page-header.ejs` + `views/components/ui/breadcrumb.ejs`.
- Consumers: 42 pages (breadcrumb), 4 pages (page-header).
- Merge: hand-rolled `.al-page-header`+`text-xl font-semibold` h1 in ~22 spots -> `ui/page-header`; delete `pageTitle.ejs`.
- Page-specific: auth split-screen styling stays in auth-styles.ejs.
- **Phase 2 status: PARTIAL** — `pageTitle.ejs` deleted; playerstats.ejs migrated to `ui/page-header`. ~21 other spots still hand-rolled.

### Cards / panels
- Owner: `public/tw.css` card pattern (`bg-white dark:bg-white/5 rounded-xl border ...`).
- Consumers: all pages.
- Merge: none needed; enforce via design tokens.
- Page-specific: none.

### Tables
- Owner: `public/tw.css` `.al-table` + `public/javascript/shared/al-table.js` + `views/components/ui/al-pagination.ejs`.
- Consumers: 17 views.
- Merge: pagination reuse beyond files (server-side where datasets grow); fix `col-hide` class missing in tw.css (B-041).
- Page-specific: schedules collapsible row gets a table-card exception (B-042).

### Empty states / loading states
- Owner: `views/components/ui/empty-state.ejs` + `loadingPopup.ejs` + `.s-skeleton`.
- Consumers: 6 pages (empty), 12 pages (loading).
- Merge: hand-rolled empty-state markup (dashboard.js:126, files empty-dir, images gallery) -> `ui/empty-state`; unify spinners into one shared primitive.
- Page-specific: none.

### Mobile navigation
- Owner: `views/components/bottomNav.ejs` + `views/components/template.ejs` (desktop sidebar) + `page-loader.js`.
- Consumers: all app pages.
- Merge: none structurally; fix 44px touch targets (B-050).
- Page-specific: none.

### Server shell (header/meta/subnav/install banner)
- Owner: new partial `views/components/serverPageShell.ejs` (wraps header/template/breadcrumb/serverHeader/serverMeta/installHeader/serverTemplate).
- Consumers: all 11 `user/server/*` pages.
- Merge: ~11 copies of the shell -> one partial with data-driven slots.
- Page-specific: manage.ejs keeps its mobile console section.
- **Phase 4 status:** installHeader banner is install-state owned. On the manage page, install-complete and reinstall now reconnect sockets in place (no reload); non-manage pages still reload as a fallback.

### Server summary / metadata
- Owner: `views/components/serverMeta.ejs`.
- Consumers: 10 server pages.
- Merge: none.
- Page-specific: none.

### Confirmation flows / destructive actions
- Owner: `views/components/modal.ejs` `window.modal.confirm`.
- Consumers: ~30 call sites.
- Merge: flip `danger` default to false (B-076); ensure every destructive action passes `danger:true`; add confirm to stop (B-080).
- Page-specific: none.
- **Phase 2 status: PARTIAL** — B-076 done (default primary; danger explicit). Confirm-to-stop (B-080) deferred to Phase 7.

### Fetch / data layer
- Owner: new `public/javascript/shared/api.js` exposing a small `api(url, opts)` wrapper (JSON, `!ok` normalization, optional toast, AbortSignal support).
- Consumers: all page JS + inline scripts.
- Merge: ~140 raw `fetch(` -> wrapper; delete 3 `getCsrf` copies; keep `csrf.js` global patch.
- Page-specific: none.
- **Phase 2 status: PARTIAL** — `api.js` created (non-defer via header.ejs). Migrated: subusers.ejs, schedules.ejs, admin-databases.js, admin-settings.js, admin-servers.js (simple flows), admin-image-store.js, admin-image-edit.js, modrinth-admin.js (dead file). Intentionally NOT migrated: admin-nodes.js (delete flow needs error body for the instance-exists second confirm; status poll wants silent failures). ~120 raw fetch remain.

### Animation / motion
- Owner: `public/javascript/shared/motion.js` + `layout-animations.js` + `animations.js` + `motion.css` + `layout-animations.css`.
- Consumers: all pages.
- Merge: decide @formkit/auto-animate (currently unused): either wire it in to delete the FLIP core or drop the dep (B-075); gate checkbox spring under reduced motion (B-077); keep `data-animate` only if views adopt it.
- Page-specific: none.

### Escaping / sanitization (client)
- Owner: new `public/javascript/shared/escape.js` with `escHtml/escAttr/escJS`.
- Consumers: all pages building HTML strings.
- Merge: 14+ inline escaping chains -> shared helper.
- Page-specific: none.
- **Phase 2 status: PARTIAL** — `escape.js` created (non-defer via header.ejs). Migrated: credits.ejs, backups.ejs, players.ejs, 2fa-setup.ejs (inline) + search.js, admin-image-store.js, admin-image-edit.js, admin-servers.js, modrinth-admin.js (page JS). Other inline chains reviewed and left as-is where escaping was already adequate.

### Date / time / bytes formatting
- Owner: new `public/javascript/shared/format.js` (formatDate, formatUptime, formatBytes).
- Consumers: all pages.
- Merge: 3 uptime formatters + 2 formatBytes + ~25 `toLocale*` call sites; fix locale divergence (B-082).
- Page-specific: none.

### Icons
- Owner: server `src/utils/icon.ts` (lucide) + client `public/js/shared/al-icon.js`.
- Consumers: 516 server call sites, 34 client call sites.
- Merge: replace 3 hardcoded SVGs with helpers; add regenerate check for al-icon.js.
- Page-specific: brand SVGs in overview/credits stay.
- **Phase 2 status: PARTIAL** — toast dismiss X -> `alIcon('x')`; databases.ejs eye/eye-off -> `icon('eye')`/`icon('eye-off')`. No hardcoded non-brand stroke SVGs remain in toast/databases.

### Error envelopes (server)
- Owner: new shared sanitizer module (e.g. `src/utils/errors.ts`) returning `{ safeMessage, category, hint, debug?, logPayload }`.
- Consumers: all API/route catch blocks + `errorPages.ts` + `app.ts` render-error override.
- Merge: stop relaying `body.error`/`err.message` from daemon/DB/S3 (B-001..B-012); gate `errorPages.ts:168` + `app.ts` override on a strict production flag.
- Page-specific: none.
- **Phase 5 status:** implemented as `src/utils/errors.ts`. Trusted daemon structured `error`/`message` fields are relayed verbatim via `daemonMessage()` (HMAC peer API contract, e.g. `Invalid name` from /fs/rename — enforced by `tests/filesBackend.test.ts`); panel-local exception text and raw object dumps are sanitized via `safeClientMessage()`; `isProductionPosture()` treats an unset NODE_ENV as production-safe. B-001..B-012 applied across user routes, v1 API, admin routes, error pages, and addon manifest. B-013 (server-side log redaction) deferred.

## Things that stay page-specific
- Dashboard folder drag-and-drop + card grid.
- Files browser (list, breadcrumb, upload/download, editor entry).
- Manage console/terminal/charts/live state. **Phase 4 status:** hard-paged to a single init path — `connectWebSocket()` runs once, lifecycle socket reconnects, all sockets teardown on unload, log fetches abort/supersede, charts rAF-batch, disk limit reads `server.Storage`, mobile stats grid mirrors the live stream. Retry/install/EULA flows no longer reload on the manage page.
- Auth split-screen layout (login/register/forgot/reset/2fa).
- Admin analytics/playerstats/node-stats chart pages (config-only chart.js usage).
- Ports allocator UI (content) after its listbox merges into custom-select.

## Files to delete / merge targets (shortlist)
- Delete: `views/components/pageTitle.ejs` — **DONE (P2)**.
- Delete: `public/javascript/admin/admin-airlink-cloud-settings.js`, `public/javascript/admin/modrinth-admin.js` (unreferenced; confirmed no route loads them) — Phase 8.
- Merge: toast re-includes (39 views) — **DONE (P2)**; `al-sheet-overlay` markup (~13 views), server shell (~11 copies), escaping chains (14+; partially done), getCsrf copies (3) — **DONE (P2)**.
- Inert code to resolve: `motion.js` `data-animate` layer, `layout-animations.js` `airlinkAnimate` API, @formkit/auto-animate dep.
