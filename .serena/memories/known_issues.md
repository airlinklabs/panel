# Known issues on `fix-dogshit-ui` (verified 2026-09-28)

## P0 — 49 missing view targets in the LIVE modules ⇒ HTTP 500
Verified by script: every `res.render` in `src/modules/{admin,user}` with no `views/<x>.ejs` or `views/<x>/index.ejs`.
Two classes:
1. **Stale double-name renders** (Phase 3 renamed views to `index.ejs` but not the controllers):
   `admin/{activity/activity, addons/addons, analytics/analytics, apikeys/apikeys, databases/databases,
   images/images, menu/menu, mounts/mounts, nodes/nodes, overview/overview, playerstats/playerstats,
   settings/settings, users/users, users/user}`, `user/credits`, `user/2fa-setup`.
   `views/admin/locations/` **does not exist at all**.
2. **`views/fragments/**` was deleted entirely** but is still rendered 17+ times
   (`fragments/admin/{nodes/node-table, databases/host-list, mounts/mount-list, mounts/mount-create-form,
   apikeys/key-list, users/user-list, locations/location-list, locations/location-nodes,
   images/image-table, images/pending-approvals}`, `fragments/user/server/{db-list, settings-form,
   startup-command, startup-docker, startup-variables}`, `fragments/user/two-factor-recovery-codes`).
Fix = point controllers at `<dir>/index` + delete/restore fragment branches, **or** mount the 24 `src/modules/pages/*` modules (which already target `index.ejs`).

## P0 — two competing module trees
- `src/modules/registry.ts` mounts 35 **legacy** modules.
- `src/modules/pages/**` (24 modules + `index.ts` barrel) is **never imported anywhere** — this is the rewrite target.
- `tests/featureRegistry.test.ts:29-35` counts every module-shaped file (59) and asserts `FEATURE_REGISTRY.length` (35) ⇒ **test fails**.

## P0 — CSS never reaches the browser
- `views/layouts/base.ejs:23` and `auth.ejs:28` request `/styles.css` — **no producer exists**
  (old pipeline `tailwindcss -i ./public/styles/tw.css` input was moved to `views/styles/main.css`; `scripts/setup.mjs:744` and `installer.sh:1362` still reference it).
- `base.ejs:26-27` requests `/themes/default-{light,dark}.css` but the mount is `/themes/builtin` ⇒ 404, so `var(--theme-*)` are undefined.
- Vite emits `public/assets/css/panel-<hash>.css` + `public/.vite/manifest.json`, **nothing links them**, and `templateConfig.assetUrl()` looks up keys no template ever asks for.
- **No `@tailwindcss/vite` or `@tailwindcss/postcss` dependency** ⇒ `@apply` in the 21 component files has no transform.

## P0 — client JS is unreachable
Only static root is `public/` (`src/app.ts:118`); there is **no `/javascript` mount**, so all of `views/javascript/**`
(islands, `api-client.js`, `csrf.js`, `realtime.js`) is unserved. `base.ejs:42-47` also requests 6 scripts with no matching file anywhere
(`al-icon.js`, `format-switcher.js`, `al-tabs.js`, `custom-select.js`, `search.js`, `api-client.js` at the wrong path).
`/monaco/vs/loader.js` has no route either.

## P1 — addon unload is a no-op on Express 5
`addonHandler.ts:765,1192` read `(app as any)._router?.stack`; **Express 5.2.1 has no `app._router`** (router is a closure getter).
⇒ routers/static layers are never spliced out; toggles/reloads accumulate routes, and re-mounted routes land **after**
`notFoundHandler` so they are shadowed. Uninstall `fs.rmSync`s files while routes stay live. Fix target: `app.router.stack`.

## P1 — shipped addons cannot load
- `storage/addons/{modrinth,airlink-cloud}` declare `main: "dist/index.js"` but **nothing builds addon `dist/`**
  (only `installer.sh:1321-1359` does, by cloning an external repo) ⇒ `log.addonMissingMainFile`, skipped.
- modrinth migrations are **SQLite syntax** (`AUTOINCREMENT`, `DATETIME`) on a **Postgres** schema ⇒ migration fails, addon force-disabled.
- Async entrypoints lose lifecycle hooks: `addonHandler.ts:1017-1029` assigns a Promise to `hooks`, so `onDisable`/`onUninstall` never run.
- **34-slot system is write-only** — `renderSlot`/`renderSlotSync` have zero call sites in `views/**`.
- Addon `capabilities` are stored but never enforced.

## P1 — settings toggles are inert
`Settings.{sftpEnabled, backupsEnabled, schedulesEnabled, databasesEnabled, fileManagerEnabled, consoleEnabled,
playerTrackingEnabled, scannerEnabled, airlinkCloudEnabled}` are editable in `views/admin/settings/index.ejs` and persisted,
but **no route or view reads them**. (`rateLimitEnabled` and `airlinkCloudBackupEnabled` ARE enforced.)

## P1 — test suite is stale
- 14+ tests read files that no longer exist: `public/javascript/shared/*` (`alTabs`, `alDialog`, `alTable`, `alField`, `alState`, `alAction`, `state`, `toastStore`, `realtime`, `operations`, `pageLoader`, `islands`), `views/partials/header.ejs`, `views/admin/security/manage.ejs`.
- `tests/designMotion.test.ts` reads `public/styles/tw.css` (gone).
- `tests/i18n/localeDetection.test.ts` tests `localeMiddleware` — which is **not mounted**.
- `test:coverage` needs `@vitest/coverage-v8` (not a dep). `test:e2e` has no specs; `playwright.config.ts` testDir `./tests` would pick up vitest files.
- `db:seed` → `dist/cli/seed.js` has no source (`src/cli/` only has `secret.ts`).

## P2 — misc correctness
- `package.json` declares `dependencies` **twice** (lines ~58 and ~105); JSON.parse keeps the second.
- `errors/error.ejs` missing ⇒ `renderErrorPage` degrades to plain text (`errorPages.ts:95,161`).
- `daemonRequest` has **no default timeout** — omit `timeout` and the request can hang forever.
- Two daemon clients disagree on the power endpoint; `api/v2` power bypasses the capacity queue.
- `src/handlers/jobQueue.ts` (Redis job queue), `src/handlers/middleware/localeMiddleware.ts`, `requireApiAuth`, `internalApiClient` are dead.
- `src/modules/admin/uiComponents.ts` returns an empty `Router()`.
- Rate limiter **fails open** when Redis is down (`redisRateLimit.ts:75-78`).
- README claims cluster mode / Alpine+HTMX / `docs/specsheet.md` — none exist.

## P2 — i18n
- Locale comes from the `lang` cookie only; no `Accept-Language`, no allowlist validation.
- Lingui stack (`src/i18n`, `localeMiddleware`, `locales/`, `lingui.config.ts`) is entirely unwired; `pnpm lingui:extract --clean` has no macro sources and would empty the catalogs.