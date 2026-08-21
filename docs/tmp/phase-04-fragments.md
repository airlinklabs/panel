# Phase 04 — build fragment conventions and first vertical slice

## Goal

Prove the architecture with one complete, low-risk vertical slice before converting page families.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- Phase 02 decisions and Phase 03 evidence

## Choose the slice

Pick a modest authenticated CRUD/list surface with no WebSocket, terminal, editor, chart, or file upload dependency. An admin list with filter/pagination and a simple create/delete flow is suitable. Do not choose server manage, files, schedules, or account as the first slice.

## Work

1. Create the full-page view, fragment view(s), and shared view-model function according to Phase 02. The page controller must render initial server data; the HTMX handler must render the same canonical region.
2. Implement filter, pagination, create/update/delete, validation, empty state, loading/disabled action state, and error state with EJS fragments. Keep pagination/filter state in URL query parameters where it is shareable/bookmarkable.
3. Use explicit `hx-target`, `hx-swap`, `hx-indicator`, `hx-disabled-elt`, and `hx-push-url` only where each improves the interaction. Include an accessible live status region for result feedback.
4. After a successful mutation, return the replacement region and trigger exactly named events such as `al:toast` or `al:resource-updated`. Consumers must be local and documented. For a validation failure, preserve entered values and render field-associated errors; do not replace the entire page.
5. Ensure destructive actions keep the existing explicit confirmation pattern. HTMX does not replace confirmation/permission checks.
6. Write route tests covering full-page versus `HX-Request` responses, authorization, CSRF rejection, malformed input, empty result, success, and server failure. Add DOM-level checks for one ID only, no shell markup in fragments, labels/error associations, and non-duplicated IDs.
7. Compare the vertical slice with Phase 01 screenshots across screen sizes and themes. Record any intended UX improvement and why it preserves the product style.

## Acceptance criteria

- Browser network activity for the slice shows HTML fragment responses for partial updates, with no raw JSON-to-DOM reconstruction.
- Direct reload, Back/Forward, JS-disabled form submission where reasonable, and a failed mutation all leave the user in a coherent state.
- The same route service/view model feeds initial and partial render paths.
- The slice’s legacy page script/functions are removed only if repository-wide search confirms they are unused.

## Reusable output

Document a short copyable fragment checklist in `architecture-decisions.md`, including required response headers, DOM ID naming, loading state, error shape, focus behaviour, and tests. Later phases must use it rather than inventing variants.
