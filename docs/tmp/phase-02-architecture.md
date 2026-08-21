# Phase 02 — define the target architecture

## Goal

Write and enforce the rendering, fragment, and ownership contracts before implementation spreads a new kind of inconsistency.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `docs/tmp/prompt.md` and Phase 01 evidence
- `src/app.ts`, `src/handlers/renderResolver.ts`, `src/handlers/modulesLoader.ts`
- one user module, one admin module, `src/modules/user/serverConsole.ts`
- `views/components/header.ejs`, `template.ejs`, `footer.ejs`, `modal.ejs`, `toast.ejs`

## Required decisions (write them in `docs/tmp/architecture-decisions.md`)

1. **Directory model.** Retain `views/` for full pages and introduce `views/fragments/` for route-specific replaceable regions, with `views/components/` remaining reusable primitives. Choose and document a convention such as `views/fragments/user/dashboard/server-list.ejs`. Do not create a second template root.
2. **Route model.** Keep feature modules as Express router factories. A page controller may branch on `HX-Request`, but authorization, validation, query construction, and view-model creation must be shared. Prefer a page-handler helper that renders either `{ page, fragment, locals }` over parallel handlers that drift.
3. **Fragment response contract.** Each fragment gets a stable, semantic DOM ID. It returns only the region being replaced, never `<!doctype>`, header, sidebar, global modal/toast shell, or a nested duplicate ID. Define whether the response swaps `outerHTML` or `innerHTML`; use one default.
4. **Mutation contract.** Validate and authorize on the server; on success return the canonical updated fragment plus `HX-Trigger` events for global feedback; on failure return a field/region error fragment with an appropriate 4xx status. Use redirect-after-POST only for non-HTMX full forms. Define explicit 401, 403, 404, 409, 422, and 500 behaviour.
5. **Data contract.** Full pages and fragments call the same typed service/view-model functions. JSON APIs remain JSON APIs; do not repurpose public `/api` endpoints as HTML endpoints. HTML fragments live alongside their owning feature route.
6. **State boundary.** HTMX owns remote state. Alpine owns only local state. Islands own only their integration. Write examples and counterexamples for each category.
7. **Response headers.** State the exact use of `HX-Redirect`, `HX-Location`, `HX-Retarget`, `HX-Reswap`, `HX-Trigger`, cache-control, and `Vary: HX-Request`. Set `Vary: HX-Request` for handlers that vary HTML by that header.
8. **Error and observability contract.** Reuse `safeClientMessage()` and existing error policies. Preserve request IDs. Log fragment-render failures with route/fragment identifiers, never raw sensitive data.

## Acceptance criteria

- `architecture-decisions.md` is concrete enough for an agent to implement two different fragments without making new design decisions.
- The design names the exact boundary for page, fragment, Alpine state, and specialist island.
- The plan preserves addons: addons may render their own EJS views through the resolver, while core HTMX conventions are documented as optional extension contracts rather than assumed internals.

## Do not do yet

- Do not add global HTMX handlers or a global `hx-boost` attribute.
- Do not place authorization or data access inside EJS templates.
