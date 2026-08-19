# Phase 11 — security, performance, cleanup, and release evidence

## Goal

Finish with a maintainable system and evidence that it is safe to ship.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `docs/tmp/migration-log.md` and all phase evidence

## Work

1. Run repository-wide scans for leftover raw fetches, inline scripts, duplicate component implementations, raw error exposure, unsafe HTML insertion, Turbo/Stimulus/Query references, and orphaned assets. Each remaining exception must be a documented specialist island or be removed.
2. Recheck security contracts: CSP nonce coverage, no broadened CSP directives, CSRF for HTMX and upload mutations, auth/authorization parity on fragment routes, `Vary: HX-Request`, no cache leak of user fragments, safe error messages, path security, and addon resolver containment.
3. Recheck performance: page/fragment payload size, shared script count, no repeated global listeners, no duplicate WebSockets/polling, cleanup on swap/navigation, fragment queries scoped to the updated region, and no N+1 data lookup introduced by partial rendering.
4. Run the complete verification suite: `pnpm run typecheck`, `pnpm test`, `pnpm run build`, plus all relevant manually exercised browser flows. Add a focused smoke suite only if it can be maintained in the current repository; do not recreate unrelated deleted smoke infrastructure without approval.
5. Run the design detector once on the changed UI targets, as required by the project’s interface-quality setup: `node .agents/skills/impeccable/scripts/detect.mjs --json <changed-targets>`. Fix actionable findings that do not conflict with the documented visual system; log any false positives with rationale.
6. Update architecture and contributor documentation: rendering model, fragment conventions, Alpine/island rules, how to add a route, test guidance, dependency list, and addon guidance. Remove stale Turbo-era instructions.
7. Produce a final migration report in `docs/tmp/migration-log.md`: files removed, dependencies removed, routes migrated, remaining islands, verification output, visual comparison results, known follow-ups, and rollback points.

## Release acceptance criteria

- The final runtime is EJS + HTMX + Alpine plus a small documented set of explicit specialist islands.
- Dynamic data is server-rendered from a single canonical path, and all mutations retain CSRF/auth/error handling.
- No user-facing UI regression appears in the baseline routes and states.
- The codebase has fewer global scripts, duplicate primitives, inline scripts, and dead dependencies than the baseline.
