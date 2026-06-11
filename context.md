# Airlink Panel Refactor Context

This document records the work performed from the `prompt.md` refactor request and the follow-up fixes.

## Starting Point

The project originally used two parallel EJS view trees:

- `views/desktop/...`
- `views/mobile/...`

Most pages existed twice. Express did not render the view path directly. Instead, `src/app.ts` wrapped `res.render()` and prefixed each route view with `desktop/` or `mobile/` based on the `viewport_mode` cookie. Example:

- Route called `res.render('user/dashboard')`
- Middleware rendered either `views/desktop/user/dashboard.ejs` or `views/mobile/user/dashboard.ejs`

There was also a mobile-only `/admin/menu` route that rendered `views/mobile/admin/menu/menu.ejs`. Mobile users reached this page from the Admin button in the bottom nav.

## Requested Goal

The prompt requested a unified responsive UI:

- Merge desktop and mobile views into one `views/` tree.
- Remove view-path selection by viewport.
- Build one responsive `views/components/template.ejs`.
- Keep desktop sidebar/topbar at `lg` and above.
- Keep mobile topbar/bottom nav below `lg`.
- Replace `/admin/menu` with an in-nav mobile Admin bottom sheet.
- Add shared UI component partials.
- Add global `window.ui`.
- Add TypeScript `UIBuilder`.
- Delete old split directories.

## View Tree Changes

The desktop files were used as the base for the unified files.

New unified structure now exists under:

- `views/components/`
- `views/components/ui/`
- `views/auth/`
- `views/user/`
- `views/user/server/`
- `views/admin/`
- `views/admin/nodes/`
- `views/admin/servers/`
- `views/admin/users/`
- `views/admin/images/`
- `views/admin/addons/`
- `views/admin/apikeys/`
- `views/admin/playerstats/`
- `views/admin/airlink-cloud/`
- `views/api/`
- `views/errors/`
- `views/index.ejs`

Flattened admin pages:

- `views/desktop/admin/overview/overview.ejs` became `views/admin/overview.ejs`
- `views/desktop/admin/settings/settings.ejs` became `views/admin/settings.ejs`
- `views/desktop/admin/security/security.ejs` became `views/admin/security.ejs`
- `views/desktop/admin/analytics/analytics.ejs` became `views/admin/analytics.ejs`

The old directories were deleted:

- `views/desktop/`
- `views/mobile/`

## Route Changes

`src/app.ts` was changed so normal view paths render directly.

Before:

```ts
const prefix = isMobileViewport ? 'mobile/' : 'desktop/';
const prefixedView = view.startsWith('desktop/') || view.startsWith('mobile/')
  ? view
  : prefix + view;
return originalRenderBase(prefixedView, options, callback);
```

After:

```ts
const viewPath = path.join(viewsPath, view + '.ejs');
return originalRenderBase(view, options, callback);
```

Addon fallback logic still checks addon viewport subdirectories first, then addon generic view paths.

Updated route render paths:

- `src/modules/admin/overview.ts`: `admin/overview/overview` to `admin/overview`
- `src/modules/admin/settings.ts`: `admin/settings/settings` to `admin/settings`
- `src/modules/admin/analytics.ts`: `admin/analytics/analytics` to `admin/analytics`

`src/handlers/errorPages.ts` now always renders:

```ts
errors/error
```

instead of choosing `mobile/errors/error` or `desktop/errors/error`.

The `/admin/menu` route was removed from `src/modules/admin/overview.ts`.

## Unified Template

`views/components/template.ejs` now contains both desktop and mobile chrome.

Desktop:

- Sidebar visible with `lg:fixed lg:flex`.
- Topbar hidden below `lg` with `hidden lg:flex`.
- Sidebar keeps old active pill, admin section, account block, logout block, addon menu items, and online-check WebSocket.

Mobile:

- Topbar uses `.mobile-top-bar lg:hidden`.
- Bottom nav uses `.mobile-bottom-nav lg:hidden`.
- Mobile search expand/collapse preserved.
- Mobile More sheet preserved.
- Admin nav no longer links to `/admin/menu`.
- Admin button opens `#admin-sheet`.

Admin mobile sheet:

- `#admin-sheet-backdrop`
- `#admin-sheet`
- Opens from `#admin-sheet-open`.
- Closes on close button, backdrop, or Escape.
- Includes built-in admin links and addon `adminMenuItems`.

Page-loader overlay positioning now uses:

```js
var desktop = window.matchMedia('(min-width: 1024px)').matches;
ov.style.left = desktop ? '224px' : '0';
ov.style.top = desktop ? '64px' : '56px';
ov.style.right = '0';
ov.style.bottom = desktop ? '0' : '64px';
```

## Header Changes

`views/components/header.ejs` now loads:

```html
<script nonce="<%- nonce %>" src="/js/ui.js"></script>
```

Theme toggle logic was adjusted to support more than one toggle:

- Desktop toggle has `data-theme-toggle`.
- Mobile toggle has `data-theme-toggle`.
- `updateToggleDot()` updates every theme toggle.

The desktop header toggle is hidden below `lg`:

```html
hidden lg:flex
```

## Shared UI Components

Added EJS partials:

- `views/components/ui/button.ejs`
- `views/components/ui/input.ejs`
- `views/components/ui/select.ejs`
- `views/components/ui/switch.ejs`
- `views/components/ui/radio.ejs`
- `views/components/ui/checkbox.ejs`
- `views/components/ui/card.ejs`
- `views/components/ui/table.ejs`
- `views/components/ui/badge.ejs`
- `views/components/ui/alert.ejs`
- `views/components/ui/sheet.ejs`
- `views/components/ui/dialog.ejs`
- `views/components/ui/empty-state.ejs`

These are available for future page migrations. Existing pages were not fully migrated to use these partials; the first pass focused on making the unified tree render and preserving behavior.

## Global UI JavaScript

Added:

- `public/js/ui.js`

It defines:

```js
window.ui = {
  openSheet,
  closeSheet,
  registerSheet,
  closeAllSheets,
  openDialog,
  closeDialog,
  registerDialog,
  toast,
  confirm
};
```

It supports sheet/dialog open and close behavior, Escape closing, and wrappers around existing toast/confirm APIs.

## TypeScript UI Builder

Added:

- `src/utils/uiBuilder.ts`

It exports:

- `ButtonConfig`
- `TableConfig`
- `BadgeConfig`
- `AlertConfig`
- `InputConfig`
- `UIBuilder`

Current builder methods:

- `UIBuilder.button()`
- `UIBuilder.table()`
- `UIBuilder.badge()`
- `UIBuilder.alert()`
- `UIBuilder.input()`

## Include Path Fixes

Because files moved upward from `views/desktop/...`, several include paths had to be changed.

Examples:

- Top-level admin files now use `../components/...`
- Nested admin files still use `../../components/...`
- `views/components/store.ejs` had stale `../../components/...` includes and was fixed to use `./...`

A static include-path check was run after this fix.

## Mobile Bar Follow-Up Fix

After the first refactor, mobile topbar and bottom nav did not show.

Cause:

Every page included `template.ejs` inside a wrapper changed to:

```html
<div class="hidden lg:block w-60 ...">
  <%- include('../components/template') %>
</div>
```

That hid the whole template on mobile, including the mobile topbar and bottom nav.

Fix:

All wrappers were changed from:

```html
hidden lg:block w-60
```

to:

```html
contents lg:block w-60
```

Effect:

- Mobile: wrapper creates no box but the fixed mobile chrome still renders.
- Desktop: wrapper still reserves the sidebar width.

## Runtime Error Follow-Up Fix

An EJS runtime error happened:

```txt
Cannot access 'mobileSidebarItems' before initialization
```

Cause:

A bulk replacement accidentally changed the desktop sidebar condition to use `mobileSidebarItems` before the mobile block declared it.

Broken line:

```ejs
if (!mobileSidebarItems || mobileSidebarItems.length === 0) {
```

Fixed line:

```ejs
if (!sidebarItems || sidebarItems.length === 0) {
```

## Verification Performed

These checks passed after the fixes:

```sh
npm run build
```

This runs:

```sh
tsc && tailwindcss -i ./public/tw.css -o ./public/styles.css
```

EJS compile check was also run with Node/EJS against all files in `views/`.

Static include-path check was run to confirm all literal EJS includes resolve.

Search check showed no remaining `desktop/`, `mobile/`, or `admin/menu` references in `src` or active `views`.

## Server Start Note

`npm start` was attempted once, but Prisma blocked startup because `db push` warned about data loss:

```txt
You are about to drop the column `disableAnimations` on the `Users` table, which still contains 1 non-null values.
Error: Use the --accept-data-loss flag to ignore the data loss warnings like prisma db push --accept-data-loss
```

No destructive Prisma command was run.

## Current Important Files

Main files changed or added:

- `src/app.ts`
- `src/handlers/errorPages.ts`
- `src/modules/admin/overview.ts`
- `src/modules/admin/settings.ts`
- `src/modules/admin/analytics.ts`
- `src/utils/uiBuilder.ts`
- `public/js/ui.js`
- `views/components/header.ejs`
- `views/components/template.ejs`
- `views/components/ui/*.ejs`
- unified `views/**/*.ejs`

Generated file:

- `public/styles.css` was regenerated by Tailwind during `npm run build`.

Unrelated files that were already present and not part of the implementation:

- `prompt.md`
- `panel-ui-visual-fix.zip`

## Known Remaining Work

The prompt asked for every page to migrate all badges, alerts, buttons, inputs, tables, selects, switches, radios, checkboxes, dialogs, and sheets to shared UI partials. The shared component system exists, but existing pages were not exhaustively rewritten to use it. That would be a separate broad migration pass.

Mobile and desktop visual QA in a browser is still recommended after resolving the Prisma startup warning.
