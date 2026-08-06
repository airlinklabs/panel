# Panel UI Inventory

Phase 1 deliverable. Static inventory of the panel frontend as of 2026-08-06.

## Stack

- Views: EJS (50 pages, 26 shared partials), Tailwind v4 via `public/tw.css` -> `public/styles.css` (build artifact).
- Client JS: vanilla. `public/javascript/shared/*` loaded on ~44 app pages via `header.ejs`; page-specific JS in `public/javascript/user/*` and `public/javascript/admin/*` (mostly unused: most page logic is inline `<script>` in the EJS).
- Shared libs: xterm + fit + web-links, chart.js, monaco-editor, lucide (server `icon()` helper + generated client `alIcon()`), @formkit/auto-animate (declared but unused).
- No SPA framework. `page-loader.js` fakes a fade-out then does a hard navigation; `al:navigated` is listened for but never dispatched.
- Routing: no `src/routes/`; modules live in `src/modules/*.ts`, mounted via `src/handlers/modulesLoader.ts`. Views are rendered with `res.render`.

## Pages and routes

| Page | Route | Page JS | Inline script | Hot |
|---|---|---|---|---|
| user/dashboard | `/` | user/dashboard.js | yes + inline style | yes |
| user/account | `/account` | none | yes (14k) | |
| user/credits | `/credits` | none | yes (7k) + inline style | |
| user/2fa-setup | `/account/2fa/setup` | none | yes | |
| user/create-server | `/create-server` | user/create-server.js | yes + inline style | |
| user/server/manage | `/server/:id` | none (xterm + chart.js scripts) | yes (60k) + inline style | yes |
| user/server/files | `/server/:id/files` | none | yes (40k) + inline style | yes |
| user/server/file | `/server/:id/files/edit/{*path}` | none (monaco) | yes (10k) + inline style | |
| user/server/databases | `/server/:id/databases` | none | yes (7k) | |
| user/server/backups | `/server/:id/backups` | none | yes (9k) | |
| user/server/schedules | `/server/:id/schedules` | none | yes (25k) | |
| user/server/settings | `/server/:id/settings` | none | yes (7.5k) | |
| user/server/startup | `/server/:id/startup` | none | yes (8k) | |
| user/server/subusers | `/server/:id/subusers` | none | yes (4.5k) + inline style | |
| user/server/players | `/server/:id/players` | none | yes (4.4k) | |
| user/server/worlds | `/server/:id/worlds` | none | yes (3.2k) | |
| admin/overview | `/admin/overview` | admin-overview.js | no; inline style | |
| admin/activity | `/admin/activity` | none | no | |
| admin/analytics | `/admin/analytics` | admin-analytics.js | no | |
| admin/addons | `/admin/addons` | admin-addons.js | no; inline style | |
| admin/addons/store | `/admin/addons/store` | none | no; inline style | |
| admin/apikeys | `/admin/apikeys` | apikeys.js | yes (14k) + inline style | |
| admin/apikeys/docs | `/admin/api/docs` | admin-apikeys-docs.js | no | |
| admin/databases | `/admin/databases` | admin-databases.js | no | |
| admin/databases/create | `/admin/databases/create` | admin-databases.js | no | |
| admin/images | `/admin/images` | admin-images.js | no; inline style | |
| admin/images/edit | `/admin/images/edit/:id` | admin-image-edit.js (monaco) | yes (2.9k) | |
| admin/images/store | `/admin/images/store` | admin-image-store.js | no; inline style x2 | |
| admin/menu | `/admin/menu` (also `/menu`) | none | redirect only | |
| admin/mounts | `/admin/mounts` | none | yes (2.3k); **missing footer include** | |
| admin/nodes | `/admin/nodes` | admin-nodes.js | yes (3.6k) | |
| admin/nodes/create | `/admin/nodes/create` | admin-node-create.js | no; inline style | |
| admin/nodes/edit | `/admin/node/:id` | admin-node-edit.js | no | |
| admin/nodes/stats | `/admin/node/:id/stats` | admin-node-stats.js | no | |
| admin/playerstats | `/admin/playerstats` | admin-playerstats.js | no | |
| admin/servers | `/admin/servers` | admin-servers.js | no | |
| admin/servers/create | `/admin/servers/create` | none | yes (11k) + inline style; **missing footer** | |
| admin/servers/edit | `/admin/servers/edit/:id` | none | yes (20k) + inline style; **missing footer** | |
| admin/settings | `/admin/settings` | admin-settings.js | yes (3.4k) | |
| admin/users | `/admin/users` | admin-users-users.js | yes (small) | |
| admin/users/create | `/admin/users/create` | admin-user-create.js | no; inline style | |
| admin/users/edit | `/admin/users/view/:id/` | admin-user-edit.js | no; inline style | |
| admin/users/user | unreachable (shadowed duplicate handler) | none | no | |
| auth/login | `/login` | none | yes (2.6k) + inline style | yes |
| auth/register | `/register` | none | yes (3.4k) + inline style | yes |
| auth/forgot-password | `/forgot-password` | none | yes + inline style | |
| auth/reset-password | `/reset-password` | none | yes (1.4k) + inline style | |
| auth/2fa-verify | `/2fa` | none | yes (2.5k) + inline style | |
| errors/error | any (error handler) | none | no | |
| api/documentation | `/api` | none | no | |

Notes:

- `admin/users/user.ejs` is unreachable: a second `/admin/users/create` handler in `users.ts` references `req.params.id` on a create route; the first handler wins.
- `admin/menu/menu.ejs` is only a `window.location.replace('/')`.
- Dead page JS (never referenced by a view): `admin-airlink-cloud-settings.js`, `modrinth-admin.js`.
- 3 pages include `header.ejs` but no `footer.ejs` (mounts/index, servers/create, servers/edit): `motion.js` is not loaded there.
- Manage + files + schedules + file + backups + startup + settings carry 8k-60k of inline script each. These are the refactor-heavy pages.

## Shared partials

### `views/components/ui/` (base primitives)

| Partial | Used by | Notes |
|---|---|---|
| ui/breadcrumb.ejs | 42 pages | Mobile breadcrumb + desktop topbar injection |
| ui/page-header.ejs | 4 admin list pages | Underused; same pattern hand-rolled in ~22 spots |
| ui/empty-state.ejs | 6 pages | |
| ui/stat-card.ejs | admin/overview x4 | Underused |
| ui/status-badge.ejs | dashboard, serverHeader | Underused; ~20 hand-rolled `ring-1 ring-inset` pills elsewhere |
| ui/alert.ejs | 7 pages, 11 invocations | Underused; 6 hand-rolled danger banners |
| ui/al-pagination.ejs | user/server/files only | Client-side pager over `.al-file-row` rows |

### `views/components/` (app-level)

| Partial | Used by | Notes |
|---|---|---|
| header.ejs | ~44 pages | head shell; includes bottomNav, modal, toast; loads all shared JS |
| footer.ejs | ~46 pages | loads motion.js; missing on 3 pages |
| template.ejs | ~44 pages | sidebar, topbar, search, theme toggle, online-check WS |
| bottomNav.ejs | via header (transitive) | mobile top bar + bottom nav + More sheet |
| modal.ejs | via header (transitive) | global `window.modal` confirm/alert/show |
| toast.ejs | header + 39 direct re-includes | double-include guarded by `if (window.createToastSystem) return;`; emits ~9.5KB script 40x per page |
| loadingPopup.ejs | 12 pages | `#actionFeedback` + full-screen loader |
| serverHeader.ejs | 11 server pages | server name + status; loads server-header.js |
| serverMeta.ejs | 10 server pages | image/node/short-id row |
| serverTemplate.ejs | 11 server pages | mobile server tabs |
| serverFeatures.ejs | manage only | EULA accept flow |
| installHeader.ejs | 11 server pages | install banner; hard-coded neutral colors, not theme vars |
| pageTitle.ejs | admin/playerstats only | dead duplicate of ui/page-header |
| imageViewer.ejs | files only | re-implements modal system |
| portsAllocator.ejs | admin/servers create+edit | second hand-rolled listbox (~170 LOC) |
| sftp.ejs | files only | SFTP modal; re-implements modal system |
| csrf.ejs | 8 pages | redundant with csrf.js global fetch patch |
| auth-header.ejs | 5 auth pages | duplicates ~30 lines of theme-init from header.ejs |
| auth-styles.ejs | 5 auth pages | radius 10px vs DESIGN 12px; `.auth-input/.auth-submit` duplicate `.al-*` |

## Shared JS helpers

| Helper | Role | Status |
|---|---|---|
| js/csrf.js | patches `window.fetch` to add csrf header + 401 toast/redirect | active; 31 manual meta reads + 3 local `getCsrf` copies remain |
| js/shared/al-icon.js | generated client `alIcon()` | active (34 call sites) |
| shared/al-table.js | `.al-table` mobile card collapse (3+ cols) | active (17 views) |
| shared/animations.js | `window.Animate` popup manager | active (47 call sites) |
| shared/checkbox-anim.js | checkbox bounce; reduced-motion not gated | active |
| shared/custom-select.js | upgrades `<select>` to combobox | active (8 pages) |
| shared/format-switcher.js | MB/GB unit switcher | active (8 pages) |
| shared/layout-animations.js | FLIP animations; `airlinkAnimate` API mostly dead, CSS side effects dominate | mostly dead |
| shared/loading-popup.js | full-screen loader | active (12 pages) |
| shared/motion.js | `data-animate` viewport reveals; no view uses `data-animate` | inert |
| shared/page-loader.js | SPA nav transitions; hard navigation under the hood | active |
| shared/search.js | Ctrl-K search overlay | active (44 pages) |

## Cross-cutting concern counts

- Raw `fetch(` calls: ~140 (65 in public JS, 77 in inline view scripts, ~40 files). No shared wrapper beyond the csrf patch.
- `window.modal.confirm` call sites: ~30. `Animate.openModal`: ~40 call sites across 18 views. Hand-rolled `al-sheet-overlay` divs: ~27 across ~13 views. Third variant: 3 dashboard folder popups using a `data-[open]` pattern that bypasses `Animate`.
- Modal implementations independent of `window.modal`: imageViewer, sftp, portsAllocator, dashboard (3 overlays), admin-images upload modal, admin-servers radar modal. The `if (window.Animate) ... else {...}` fallback appears ~47 times.
- Toast calls: ~339 `showToast` invocations across 40 files.
- Escaping helpers re-implemented: 14+ occurrences (`escHtml`, `escAttr/escJS`, inline `.replace(/</g,...)` chains).
- Uptime formatters: 3 (`formatUptime` in serverHeader.ejs and server-header.js, `fmtUptime` in dashboard.js). `formatBytes`: 2.
- `getCsrf` helper: 3 copies (backups.ejs, files.ejs, schedules.ejs) despite global csrf.js.
- Theme toggle: duplicated in header.ejs and auth-header.ejs.
- Server-page shell (header -> template -> breadcrumb -> serverHeader/serverMeta -> installHeader -> serverTemplate): repeated ~11x, ~800+ lines total.

## Error surfaces

- Error page: `views/errors/error.ejs` + `src/handlers/errorPages.ts`. Prints escaped `statusCode/errorTitle/errorMessage/path` (path = `req.originalUrl`). In non-production, `detail = err.message` is rendered and returned in JSON.
- `src/app.ts:504,521`: `res.status(500).send('View render error: ' + err.message)` sends raw render error to the user.
- P0 leak vectors: daemon relay in `src/modules/user/server/shared.ts:297-299` -> `console.ts:432` (power actions); `console.ts:198-202` status error field -> installHeader.ejs:132; `files.ts:910,930`; `backups.ts:286,446,551`; raw mysql2 `error.message` in `databases.ts:173,223,275` and `api.ts:1452,1494`; admin servers delete embeds `JSON.stringify(response.data)` (`servers.ts:823->865`).
- Toasts display raw server error strings (installHeader.ejs:121,132; settings.ejs:164,191,197,223; worlds.ejs:218; account.ejs:215-243 uses `r.text()` verbatim).
- WS error surfaces are sanitized fixed strings (serverConsole.ts).
- Logs: `src/handlers/logger.ts` writes full `.stack` and `util.inspect(..., {depth:5})` to `logs/` (not user-facing; hygiene flag).

## Loading surfaces

- Full-screen `loadingPopup` (`#actionFeedback` + loader), `showProgressToast`, `animate-spin` in 9 places, hand-rolled CSS spinners in 3 pages, `.af-spinner`, installHeader spinner, skeleton class `s-skeleton`. No shared spinner primitive.

## Tables / pagination

- `al-table.js` mobile card collapse + `ui/al-pagination.ejs` (used only in files). Activity log server-side paginated. users/nodes/servers/players render all rows without pagination. All tables sit inside `overflow-x-auto` wrappers (34 occurrences); tablet band scrolls inside the wrapper.

## Mobile nav

- `bottomNav.ejs`: 60px bottom rail, frosted top bar, More sheet. `header.ejs:54` clears it via `#page-content` padding under 1024px. Touch targets: theme toggle 36px, account link ~32px, pagination 28px (`h-7`), sidebar back buttons 36px.

## Inline fetch / inline script hotspots

manage (60k), files (40k), schedules (25k), servers/edit (20k), account (14k), apikeys (14k), servers/create (11k), file (10k), backups (9k), startup (8k), settings (7.5k), databases (7.4k), credits (7k).

## Untrusted-data rendering

No raw `<%- err %>`/`<%= err.stack %>` found. `<%=` escapes server-side. Client-side: toasts use `textContent`; `alIcon()` used for DOM-generated icons. Inline escaping chains exist where JS builds HTML strings.

## Overflow risks (top)

- `api/documentation.ejs:6`: `w-60` sidebar with no `hidden lg:block` -> content crushed to ~135px on phones.
- `col-hide` class undefined in tw.css (defined only in modrinth.css) -> admin table columns never hidden on mobile.
- schedules.ejs collapsible task row `<td colspan=5>` mangled by `.al-table-card`.
- errors/error.ejs:28 path `truncate` without `break-all`.
- credits.ejs:50 `grid-cols-3` no mobile collapse.
- manage.ejs: hardcoded 10GB disk chart limit; `setAllStatsOffline` hardcodes "0 Bytes / 10 GB".
