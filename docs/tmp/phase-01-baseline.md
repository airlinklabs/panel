# Phase 01 — establish a safe baseline

## Goal

Create a measurable, repeatable starting point before changing the browser architecture. This phase changes no product behaviour.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `docs/tmp/prompt.md`
- `PRODUCT.md` and `DESIGN.md`
- `docs/ui-repair/inventory.md`, `ownership-map.md`, and `behavior-matrix.md`
- `package.json`, `src/app.ts`, `views/components/header.ejs`, `public/javascript/shared/turbo-shell.js`

## Work

1. Create `docs/tmp/migration-log.md` with a date, current branch/commit, commands used, and a per-phase evidence section. It is a working artifact, not a replacement for this plan.
2. Run and record `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `git status --short`. If the baseline fails, isolate the pre-existing failure before proceeding; do not hide it with unrelated fixes.
3. Make a route-to-surface inventory from the existing static inventory. For every interactive page, record: route and method, module file, EJS view, data mutation routes, current script owner, realtime dependency, high-risk controls, and migration wave. Include auth, user, admin, server, and addon pages.
4. Capture visual baselines for representative pages: login, dashboard, server manage, server files, server backups, admin overview, admin servers, admin nodes, and settings. Capture desktop/mobile plus light/dark where supported. Use the project’s existing smoke setup only if it is present and runnable; do not revive deleted user files.
5. Add a lightweight static check or Vitest test for migration invariants: page scripts must carry a CSP nonce, fragment views may not include the document shell, and the shared shell must be included once. Keep it narrow and deterministic.
6. Write a risk register in `migration-log.md`: CSP/nonces, CSRF, Turbo caching/lifecycle, WebSockets, daemon latency/error states, uploads, Monaco/xterm, Chart.js, addon views, locale/theme persistence, and accessibility focus after swaps.

## Acceptance criteria

- Baseline command results and known failures are recorded.
- Every dynamic surface has an owner and migration wave; none is silently omitted.
- Screenshots/recording locations and the exact visual comparison method are recorded.
- The team can tell whether a later visual, route, or lifecycle regression was introduced by the migration.

## Do not do yet

- Do not install HTMX or Alpine.
- Do not remove Turbo, Stimulus, Query Core, scripts, or dependencies.
- Do not convert routes or modify API response formats.
