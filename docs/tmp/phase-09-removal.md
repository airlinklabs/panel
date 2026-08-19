# Phase 09 — remove legacy browser systems deliberately

## Goal

Delete the overlapping runtime only after its consumers have been migrated and verified.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- The migration log and completed route/island evidence

## Work

1. Search the entire repository for Turbo, Stimulus, Query Core, `ALMount`, `alOnNavigated`, `alListener`, `turbo-shell`, `turbo:`, `data-turbo`, and page-loader APIs. Classify every result as migrated, intentional compatibility, or blocker in the migration log.
2. Remove `turbo-shell.js` and then its script include only when no live page requires it. Remove its tests only when equivalent HTMX/island lifecycle tests exist.
3. Remove Turbo, Stimulus, TanStack Query core, `reconnecting-websocket` only if an actual usage search confirms it is unused, and their generated/vendor assets/build steps. Do not remove the WebSocket implementation itself merely because the client helper changes.
4. Remove `page-loader.js`, obsolete layout animation behavior, dead `ALMount` wrappers, legacy fetch code, duplicate CSRF helpers, duplicate toast/modal includes, unused page scripts, and dead styles one owner at a time.
5. Update `package.json`, `pnpm-lock.yaml`, static mounts in `src/app.ts`, asset build scripts, docs, and tests together with each removed dependency.
6. Add regression searches to tests/CI where reasonable so deleted frameworks cannot be reintroduced through the shared header without an intentional decision.

## Acceptance criteria

- `views/components/header.ejs` loads only the new required shared runtime and live specialist dependencies.
- No production source depends on Turbo lifecycle events or legacy global page remount APIs.
- The dependency graph and static asset mounts contain no orphaned packages/assets.
- All app routes work on normal browser navigation, refresh, and Back/Forward without a client-side router.

## Safety rule

Removal is evidence-driven. A missing search hit is necessary but insufficient: exercise affected routes and run tests before deleting a package or static mount.
