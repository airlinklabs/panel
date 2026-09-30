# Frontend — views, CSS, client JS, i18n

**Live stack: 100% EJS server-rendered.** The "API-first / Lingui / Vite" rewrite exists as code but is NOT wired.

## Layouts & render
- `views/layouts/{base,admin,user,auth}.ejs` + `*-footer.ejs`. `base.ejs` owns <head>, CSP nonce, dark bootstrap, `assetUrl` stylesheet/script tags, `window.__i18n`. `admin.ejs`/`user.ejs` = `include('base')` + sidebar + `#page-content`. `auth.ejs` is standalone.
- Partials: `views/partials/**` (sidebar, toast, flash-messages, pagination, empty-state, server-card, search-overlay, bottom-nav, csrf, upload-modal) + `views/partials/ui/{button,card,table,modal,form-field,breadcrumb,button-group}.ejs`.
- Override: `src/handlers/renderResolver.ts` installs `res.render` per request — order: addon slug → addon dirs → `views/<name>.ejs` → Express default.
- Express resolves `res.render('x')` → `views/x/index.ejs`, but **`res.render('x/x')` has no such fallback**.

## CSS tokens
- `views/styles/tokens/colors.css` is **documentation only** (empty `:root`, comment body listing the `--theme-*` contract).
  Actual values come from `storage/themes/builtin/*.css` served at **`/themes/builtin`**.
- `tokens/spacing-radius-shadow.css` = radii/shadows/density `--space-*`; `tokens/z-index.css` = only `--z-dropdown:9999`, `--z-overlay:70`, `--z-tooltip:2`.
- `main.css` imports everything in order: tokens → base → components → pages → `@import "tailwindcss"`.

## Client JS
- `views/javascript/shared/{api-client,csrf,escape,realtime,theme-init}.js`; `views/javascript/user/server/{files,backups,logs}.js`; `views/javascript/islands/{server-console,file-editor}.js`.
- Island contract: `export async function mount(root, config) → { teardown }`; page reads `root.dataset.*`, passes pre-translated `t()` strings in `config.translations`, imports via `<%= assetUrl('/javascript/islands/x.js') %>` inside a nonce'd `<script type="module">`.

## i18n (live)
- `src/services/i18n.ts`: `initI18n()` preloads `storage/lang/*/lang.json`; `i18nMiddleware` sets `req.lang` from **cookie `lang` only** (no `Accept-Language`), `req.t()`, `req.tn()`, `res.locals.t/tn/lang`, `res.locals.window.__i18n`.
- Template usage: `<%= t('key') %>`, `<%= tn('key', n) %>`. Backend: `req.t()`; logs: `logT()` (`LOG_LANG` env).
- Languages (10): en, de, es, fr, it, ja, pt, ru, ta, zh. Switch endpoint `POST /set-language`.
- `locales/*/messages.json` are byte-copies produced by `scripts/migrate-i18n-to-lingui.cjs` — only tests read them.

## Build
- `vite.config.mjs` → `public/assets/css/panel-<hash>.css` + `public/.vite/manifest.json`.
- Vite is spawned **on every server boot** by `addonHandler.ts:1079` → `buildTailwind()` (misnamed: runs `vite build`).
- `pnpm dev` also runs `vite build --watch`.
- `src/handlers/templateConfig.ts:55-67` reads the manifest at startup and `assetUrl()` resolves manifest keys — but **no template requests a manifest key**, so this plumbing is inert.

Related: `mem:known_issues`, `mem:core`.