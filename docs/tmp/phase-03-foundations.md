# Phase 03 — install foundations and simplify the shared shell

## Goal

Add HTMX and Alpine in a CSP-compatible way, create a small shared interaction layer, and prepare the shell while leaving existing page behaviour intact.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- Phase 02 decisions
- `src/app.ts` CSP setup and `views/components/header.ejs`
- `public/js/csrf.js`, `public/javascript/shared/api.js`, `toast-store.js`, `al-dialog.js`, `al-tabs.js`, `al-field.js`, `al-state.js`
- `public/tw.css` and `views/components/{modal,toast,bottomNav,template}.ejs`

## Work

1. Add pinned HTMX and Alpine dependencies through `pnpm`; serve self-hosted, versioned browser assets. Do not use a CDN or loosen `script-src`.
2. Establish one script loading order in the header: CSRF/session support first; HTMX configuration; Alpine; then only shared components that still have live owners. Every script must be compatible with the CSP nonce and normal full-page navigation.
3. Write a tiny HTMX bootstrap module. It must add the current CSRF token to same-origin unsafe requests, handle a 401 consistently with existing session-expiry behaviour, and dispatch one documented toast event from `HX-Trigger`. It must not monkey-patch `fetch`, replace HTML globally, or auto-run arbitrary scripts from responses.
4. Add a narrowly scoped Alpine bootstrap. Register shared Alpine data factories only where they represent genuinely repeated local behaviour (for example disclosure or temporary confirmation state). Do not create a global store for server records.
5. Rework the shared layout into an explicit shell contract: one document/head owner, one application chrome owner, one main-content slot, one global dialog/toast owner. Retain existing IDs and landmark semantics until all consumers migrate.
6. Extract duplicated theme initialization from `header.ejs` and `auth-header.ejs` into one nonce-safe external module, retaining localStorage behaviour, theme stylesheet toggling, terminal theme notification, and no-flash startup handling.
7. Keep Turbo, Stimulus, Query Core, `turbo-shell.js`, and legacy scripts loaded for now if existing pages require them. Mark every temporary coexistence point in code and the migration log.
8. Add focused tests for CSRF header injection, HTMX response event-to-toast wiring, theme initialization, and shell uniqueness. Build CSS and inspect representative pages in both themes.

## Acceptance criteria

- HTMX and Alpine are local dependencies, load under the existing CSP, and have a documented version/asset location.
- A minimal proof page or existing low-risk region can receive an HTMX fragment and show success/error feedback without Turbo.
- The shared shell does not duplicate sidebars, dialogs, toasts, or IDs after an HTMX swap.
- No legacy page regresses, because legacy lifecycle assets remain until its migration wave completes.

## Guardrails

- Do not use `hx-boost` globally. It changes navigation semantics, browser history, and script execution too broadly.
- Do not use Alpine `x-html` for server/user data.
- Do not add inline event handlers merely to avoid defining a scoped Alpine component.
