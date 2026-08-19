# Phase 05 — define Alpine scope and specialist-island lifecycle

## Goal

Replace broad global lifecycle machinery with small, explicit local state and safely mount specialist browser integrations around HTMX swaps.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `public/javascript/shared/turbo-shell.js`
- `public/javascript/shared/{al-dialog,al-tabs,al-field,al-state,custom-select,animations}.js`
- `views/components/modal.ejs`, `imageViewer.ejs`, `sftp.ejs`, `portsAllocator.ejs`
- `views/user/server/{manage,files,file,schedules}.ejs`

## Work

1. Publish a component ledger in `docs/tmp/alpine-islands.md`: component name, owning route/component, local state fields, server state fields, event inputs/outputs, mount root selector, cleanup method, and test.
2. Migrate only truly local behaviours to Alpine first: modal/disclosure state, dropdown open/close, tabs where tab choice is not server state, temporary client-side confirmation, and small UI-only toggles. Preserve keyboard interaction, focus restoration, Escape/overlay close, and reduced-motion behavior.
3. Adopt a lifecycle API for specialist modules: `mount(root, context)` returns a cleanup function; `destroy()` clears timers, abort controllers, observers, chart instances, editor models, drag listeners, and sockets it owns. The root must be stable and the module must tolerate one mount/one destroy.
4. Add one HTMX lifecycle bridge that calls teardown before a target is replaced and scans/mounts only the swapped target after settlement. It must not rescan the entire document or blindly evaluate scripts. Keep an explicit registry; no mutation-observer auto-magic.
5. Migrate shared modal/dropdown/field implementations toward one owner at a time, following `docs/ui-repair/ownership-map.md`. Keep current markup APIs during adoption. Retire aliases only after every consumer is migrated.
6. Standardize focus after swaps: validation moves focus to the first invalid field; a successful inline update preserves the initiating control where it remains; dialogs restore focus to their opener; a replaced collection announces a concise result in an `aria-live` region.

## Acceptance criteria

- Alpine components do not hold canonical server objects, poll endpoints, or manually render unsafe HTML.
- A swapped component leaves no duplicate document/window listener, timer, socket, dialog, or chart behind.
- One implementation owns each shared interaction after its migration; compatibility shims have a scheduled removal phase.

## Do not do

- Do not rewrite terminal, Monaco, Chart.js, drag/drop, or upload logic into Alpine.
- Do not use `x-for` to recreate server-rendered tables/lists that HTMX can refresh.
