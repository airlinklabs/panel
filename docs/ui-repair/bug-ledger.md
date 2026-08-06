# Bug Ledger

Phase 1 deliverable. Source: 6 parallel audit agents (inventory, shared components, manage.ejs, responsive, sanitization, packages) + prior `.impeccable/critique/2026-08-04T13-14-45Z__panel.md` + `docs/tmp/plan.md`.

Phase 2 update (shared component system): statuses appended to the Phase column as `· fixed / partial / deferred / open`.
Phase 3 update (responsive/mobile): same convention; B-056 documented as mitigated via the existing keyboard context-menu path.

Severity: P0 = breaks core flow / leaks internals; P1 = noticeably broken or risky; P2 = cosmetic or minor; P3 = polish.

Fields: ID | surface | severity | reproduction | expected | actual | cause | owner | phase | test | status

## Error leakage

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-001 | manage power actions | P0 | Start/stop/restart failure returns raw daemon error (`daemon: ${body.error} - ${body.detail}`) via `src/modules/user/server/shared.ts:297-299` -> `console.ts:432`; may contain container names, socket paths, Docker paths. Owner: server backend. | 5 · fixed (`startServerContainer` throws a safe message with `cause`=raw detail; console power-action catch uses `safeClientMessage`) |
| B-002 | install/status poll | P0 | `console.ts:198-202` returns daemon `error` verbatim; `installHeader.ejs:132` shows it. | 5 · fixed (install/status error sanitized) |
| B-003 | file ops | P0 | `files.ts:910,930` relays daemon `body.error`/`err.message` on duplicate/rename/delete/URL-pull. | 5 · fixed (daemon structured `error`/`message` fields relayed verbatim via `daemonMessage` per API contract; panel-local `err.message` fallbacks and `details:` dumps removed) |
| B-004 | backups | P0 | `backups.ts:286,446,551` relays daemon error body + `err.message` on create/restore/download. | 5 · fixed (sanitized) |
| B-005 | view render errors | P1 | `app.ts:504,521` sends `'View render error: ' + err.message` verbatim (view paths, line numbers). | 5 · fixed (gated by `isProductionPosture()`) |
| B-006 | databases | P1 | `databases.ts:173,223,275` + `api.ts:1452,1494` return raw mysql2 `error.message` (hostname/IP/port/user). | 5 · fixed (user db + v1 API sites sanitized) |
| B-007 | api keys | P1 | `api.ts:1156,1280,1816` relays daemon error bodies + raw exception messages to API consumers. | 5 · fixed (create/restore backup + update-startup relays sanitized) |
| B-008 | admin server delete | P1 | `servers.ts:823->865` embeds `JSON.stringify(response.data)` of daemon response in the error. | 5 · fixed (no JSON dump; safe message + `?force=true` hint; raw detail logged only) |
| B-009 | error page | P1 | `errorPages.ts:168` renders `err.message` when `NODE_ENV !== 'production'` (P0 if env unset). Also `path: req.originalUrl` shown. | 5 · fixed (detail gated by `isProductionPosture()`; unset NODE_ENV treated as production-safe) |
| B-010 | account page | P1 | `account.ejs:215-243` shows raw `r.text()` response body in toasts. | 5 · fixed (toast uses parsed `error`/`message` or `'Request failed'`) |
| B-011 | transfer / nodes / settings (admin) | P2 | `servers.ts:1040,1064`, `nodes.ts:507-508`, `settings.ts:513`, `databases.ts:112,150` expose daemon/S3/mysql error strings to admins. | 5 · fixed (serverTransfer + admin relays sanitized; `testDatabaseHost`/`testS3Connection` result errors sanitized) |
| B-012 | addon manifest | P2 | `addonManifest.ts:91-98` returns schema issue paths + full `filePath` of package.json (admin-only). | 5 · fixed (error strings reference addon slug, not absolute path) |
| B-013 | logs | P2 | `logger.ts:47-57` writes `.stack` + `util.inspect(depth 5)` into `logs/`; not user-facing, redaction flag. | 5 · deferred (server-side only, out of browser error path) |
| B-014 | ws-token / EULA / reinstall reloads | P1 | `installHeader.ejs:116`, `serverFeatures.ejs:14` show raw error strings AND reload the page; error + reload is a bad combo. | 4/5 · 4 fixed (installHeader EULA/reinstall reconnect in place on manage, no reload; ws-token flow preserved) · 5 fixed (ws-token error relay sanitized via `safeClientMessage`) |

## Live data / manage.ejs

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-020 | console ownership | P0 | `visibilitychange` listener, `updateConsoleOwnerUI`, and `navigator.locks.request` are nested inside the reconnect setTimeout (manage.ejs:692-738). On a healthy first load the lock is never acquired -> `consoleOwner=false` -> input silently refuses commands; each reconnect re-registers listeners. | 4 · fixed (hoisted; `connectWebSocket()` called once at top level) |
| B-021 | power action idempotency | P0 | `setButtonLoading` (manage.ejs:951-956) never sets `disabled`; double-click Start fires 2 POSTs, 2 event sockets, 2 poll intervals. | 4 · fixed (`setButtonLoading`/`clearButtonLoading` now toggle `disabled`) |
| B-022 | duplicate status writers | P1 | Passive lifecycle WS (manage.ejs:1692) + per-action event sockets (981/1068/1152) both write the status card; `lifecycleActive` only guards `updateStatus`, so stats WS and `setAllStatsOffline` can clobber status text. | 4 · fixed (`setAllStatsOffline` skips status card while lifecycle owns it; `surfaceStoppedState` no longer blanks the card on every repeated `running:false` snapshot) |
| B-023 | unthrottled chart updates | P1 | `chart.update()` with `animation:true` on every WS message (1407); needs rAF batching. | 4 · fixed (chart re-renders coalesced onto one `requestAnimationFrame`) |
| B-024 | hardcoded disk limit | P1 | Disk chart limit hardcoded 10GB (manage.ejs:1460,1651) ignoring `server.Storage`; `setAllStatsOffline` hardcodes "0 Bytes / 10 GB". | 4 · fixed (uses `server.Storage`; 0 = unlimited; `setAllStatsOffline` same) |
| B-025 | lifecycle socket leak | P1 | Passive events socket never closed (1687-1749); no teardown on navigation/unload for sockets/intervals. | 4 · fixed (lifecycle socket hoisted to `connectLifecycleSocket()` with drop-reconnect; `teardownPage()` on beforeunload/pagehide closes all sockets, cancels timers, aborts fetches) |
| B-026 | no abort/sequencing | P1 | No AbortController anywhere; slow `loadRecentLogs` can write after newer console lines; overlapping `/status` polls apply out of order. | 4 · fixed (AbortController + supersede in `loadRecentLogs`; history fetch abortable; lifecycle stopped-branch reuses `loadRecentLogs`) |
| B-027 | dead SPA hooks | P2 | `al:navigated` listened for but never dispatched; page-loader fades then hard-navigates. | 4 |
| B-028 | duplicate /power/restart route | P2 | `console.ts:437-500` shadowed by `/power/:poweraction`; dead code. | 4 |
| B-029 | reload dependence | P1 | Daemon-offline retry (manage.ejs:143,290), install-complete auto-reload (installHeader.ejs:83), reinstall (116), EULA accept (serverFeatures.ejs:14) all full-page reload. | 4 · fixed (manage-page paths: retry buttons now `retryDaemonConnection()`, install-complete/reinstall on manage reconnect in place, EULA accept no reload; non-manage install pages still reload as fallback) |

## Overflow / responsive

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-040 | api docs | P0 | `api/documentation.ejs:6` `w-60` sidebar with no `hidden lg:block`; content crushed to ~135px on 375px. | 3 · fixed (sidebar now `hidden lg:block`) |
| B-041 | admin tables | P1 | `col-hide` class undefined in tw.css (only in modrinth.css); Author/Version/Status columns never hide on mobile. | 3 · fixed (shared `.col-hide` rule added to tw.css 639px block; 3 per-view copies removed) |
| B-042 | schedules task row | P1 | Collapsible `<td colspan=5>` (schedules.ejs:123) mangled by `.al-table-card` flex rules. | 3 · fixed (CSS exception for `tr[data-tasks-row]`) |
| B-043 | error page path | P2 | `errors/error.ejs:28` path `truncate` without `break-all`; long paths unreadable. | 3 · fixed (`break-all`) |
| B-044 | credits cards | P2 | `credits.ejs:50` `grid-cols-3` no mobile collapse. | 3 · fixed (`grid-cols-1 sm:grid-cols-3`; contributors `2/3/4`, links `2/4`) |
| B-045 | nested scroll in sheets | P2 | Inner `overflow-y-auto` inside `.al-sheet-panel` (max-height 92dvh + overflow-y-auto) on images/store, backups modal, transfer, schedules, subusers; double scrollbars. | 3 · fixed (sheet bodies now `flex-1 min-h-0 overflow-y-auto` so the body is the single scroller) |

## Touch targets / keyboard / a11y

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-050 | bottom nav | P1 | Theme toggle 36px (bottomNav.ejs:8), account link ~32px (13); DESIGN promises 44px. | 3 · fixed (both now min 44px) |
| B-051 | pagination | P2 | `h-7` (28px) buttons (al-pagination.ejs:83). | 3 · fixed (h-10 / min-w-40px, prev/next p-2) |
| B-052 | ghost icon buttons | P2 | `p-1`/`p-1.5`, `w-8 h-8`, `w-7 h-7` buttons on databases, schedules, dashboard, apikeys, sftp, account. | 3 · fixed (bumped to p-2 / w-9 h-9 across 6 files) |
| B-053 | format switcher | P2 | `.al-format-switcher` sets `min-height:0` (tw.css:322) -> ~32px targets. | 3 · fixed (`min-height: 40px`) |
| B-054 | unlabeled inputs | P1 | ~40 inputs without accessible names (label-without-for in mounts, images/edit, users/create+edit, schedules, subusers; placeholder-only `#searchInput` combobox, console inputs manage.ejs:174/348, store searches). | 2 · partial (searchInput combobox + console inputs now labeled; ~35 inputs still open) |
| B-055 | duplicate `#searchInput` | P2 | Same-page duplicate on store.ejs:276 + images/store.ejs:103 (template.ejs:495). | 2 · fixed (single `#searchInput` remains in template.ejs) |
| B-056 | folder context menu | P1 | Dashboard folder menu right-click only + drag-drop mouse only (dashboard.ejs:190-193); keyboard users cannot move servers. | 3 · mitigated (keyboard path exists via server-card ctx menu Shift+F10 → Add to folder → folder picker; no new UI needed) |
| B-057 | nested interactive | P1 | `role="button"` folder card contains a real `<button>` (dashboard.ejs:102-118). | 3 · fixed (dead `.folder-menu-btn` removed; no nested interactive) |

## Contrast / theme

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-060 | quiet text contrast | P1 | `opacity-60` -> 2.47:1, `opacity-70` -> 3.6:1 in dark (breadcrumb.ejs:4, template.ejs:474, dashboard.ejs:67/79, nodes.ejs:61, alert.ejs:10, databases.ejs:75). | 6 |
| B-061 | nav text contrast | P2 | `--theme-nav-text #7a7a7a` on `#111111` ~4.4:1, under AA (all theme files). | 6 |
| B-062 | active-state inversion | P0 | Hardcoded `#171717`/`#f0f0f0` `!important` pills override the 64-var theme system (tw.css:183-196,404-481; hide-scrollbars.css:80-88). Solarized/Material/user themes cannot restyle active state. | 6 |
| B-063 | native inputs bypass themes | P0 | Tailwind forms plugin hardcodes white input bg + blue ring (styles.css:5111-5135); fields without `.al-input` break dark mode (backups.ejs:157, files.ejs:192/318/367/471, store.ejs:276, images/store.ejs:103, addons.ejs:48, images.ejs:67, apikeys/docs.ejs:156). | 2 · fixed (tw.css native-input overrides) |
| B-064 | theme var drift | P2 | 9 consumed-but-undefined vars + 8 defined-but-unused vars across theme files. | 6 |
| B-065 | component color hard-coding | P2 | installHeader.ejs, pageTitle.ejs, auth-styles.ejs use hard-coded neutrals instead of `--theme-*`. | 2 · partial (pageTitle.ejs deleted; installHeader/auth-styles remain) |

## Consistency / duplication

| ID | Surface | Sev | Actual / cause | Phase |
|---|---|---|---|---|
| B-070 | toast double-include | P1 | header.ejs includes toast + 39 views re-include it; guard prevents re-execution but emits ~9.5KB script 40x per page. | 2 · fixed (39 re-includes removed; header sole owner) |
| B-071 | parallel modals | P1 | ~27 `al-sheet-overlay` divs + 3 dashboard `data-[open]` popups + imageViewer/sftp/portsAllocator modals + admin-images/admin-servers overlays bypass `window.modal`/`Animate`; each re-implements focus/Esc/backdrop. | 2 · deferred (large consolidation; own effort) |
| B-072 | second listbox | P1 | `portsAllocator.ejs:213-390` hand-rolled listbox duplicates `custom-select.js` (two positioning engines). | 2 · deferred |
| B-073 | no fetch wrapper | P1 | ~140 raw `fetch(`; repeated `r.json -> d.success ? toast : toast -> catch` pattern 16+ times. | 2 · partial (shared `window.api` created; 5 admin JS + subusers/schedules migrated; ~120 fetch remain) |
| B-074 | server page shell duplication | P1 | ~11 copies of the 60-100 line server shell (header->template->breadcrumb->serverHeader/serverMeta->installHeader->serverTemplate). ~800+ lines. | 2 · deferred (own effort) |
| B-075 | dead/inert helpers | P2 | `pageTitle.ejs` dead duplicate of ui/page-header; @formkit/auto-animate declared but unused; motion.js `data-animate` inert (no view uses it); `airlinkAnimate` API dead; 2 dead page-JS files. | 8 · partial (pageTitle.ejs deleted in P2; modrinth-admin.js/admin-airlink-cloud-settings.js confirmed unreferenced, still to delete) |
| B-076 | confirm danger default | P2 | `modal.ejs:79` `danger = true` default -> non-destructive confirms are red. | 2 · fixed (default now primary; danger explicit) |
| B-077 | checkbox spring | P2 | `checkbox-anim.js:4` spring overshoot not gated under `prefers-reduced-motion`. | 6 |
| B-078 | missing footer | P2 | mounts/index, servers/create, servers/edit lack footer include -> motion.js not loaded. | 2 · open (verified still missing) |
| B-079 | status dot matcher | P3 | `status-badge.ejs:14` `s.startsWith('s') && s !== 'suspended'` brittle. | 7 · fixed (explicit `starting/stopping` list) |
| B-080 | stop has no confirm | P3 | `manage.ejs:116-121` stop button no confirm while deleteFolder does. | 7 |
| B-081 | hardcoded icons | P2 | 3 non-brand hardcoded stroke SVGs (toast.ejs:75 X, databases.ejs:123/198-199 eye). | 2 · fixed (toast X -> `alIcon('x')`, databases eye/eye-off -> `icon()`) |
| B-082 | date/uptime formatter duplication | P2 | 3 uptime formatters + 2 formatBytes + ~25 `toLocale*` call sites; locale divergence known (docs/12-localize). | 2 · deferred |
| B-083 | duplicate theme toggle | P2 | header.ejs:80-111 + auth-header.ejs:38-66 duplicate theme-init. | 2 · deferred |
| B-084 | `getCsrf` copies | P3 | backups.ejs:190, files.ejs:546, schedules.ejs:328 duplicate a helper csrf.js already provides globally. | 8 · fixed (removed in P2) |

## Reproductions (key P0/P1)

- B-001: Start a server while the daemon is offline or the container fails to pull. The failure toast/terminal line contains the daemon's raw error text.
- B-020: Open manage.ejs on a healthy server and type in the console before any reconnect. `input.disabled` stays true; nothing is sent.
- B-021: Rapidly double-click Start. Two power requests and two event sockets open; status flickers between polling streams.
- B-040: Open `/api` at 375px width. Sidebar takes 240px; content is unusably narrow.
- B-062/B-063: Switch to Solarized or Material theme in dark mode. Active nav pill stays near-black/white; inputs without `.al-input` render white with a blue ring.
- B-063: Open backups.ejs or files.ejs in dark mode and focus a raw `<input>`.
- B-056: On the dashboard, try to move a server card into a folder with keyboard only. Impossible.

## Coverage notes

- No browser tests exist for these surfaces today. `smoke/` exists (prior e2e Phase 11 harness). Vitest is configured.
- Phase 8 will add tests: live manage behavior, error sanitization contract, responsive behavior, shared components.
