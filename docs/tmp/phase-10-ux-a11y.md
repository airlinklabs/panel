# Phase 10 — converge UI consistency, UX, and accessibility

## Goal

Use the migration to finish consistency work without changing the product’s established visual language.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `PRODUCT.md`, `DESIGN.md`
- `docs/ui-repair/ownership-map.md`, `behavior-matrix.md`, `bug-ledger.md`
- `public/tw.css` and all `views/components/ui/*`

## Work

1. Complete the component ownership map: buttons, fields, selects, menus, dialogs, toasts, loading, states, tables, pagination, server shell, formatting, icons, and motion each have one implementation. Remove only the duplicate aliases that no page uses.
2. Standardize state regions. Every interactive surface needs an intentional first-run, empty, loading, updating, success, validation error, permission error, transport/daemon error, and disabled/busy treatment as applicable. Use `ui/empty-state`, `ui/alert`, status badges, and the selected loading owner instead of bespoke markup.
3. Fix known issues when touching their owners: mobile target sizes, missing `col-hide`, responsive credit grid, error path wrapping, schedules table-card exception, missing footers, table pagination for growing datasets, and shared formatting utilities. Reconfirm exact current locations before changing them.
4. Audit keyboard flow: skip link, top/sidebar/bottom nav, search dialog, menus, dialogs, table actions, form error movement, HTMX swap focus, Escape, visible focus, and no keyboard trap.
5. Audit screen reader semantics: landmark hierarchy, titles, labels, help/error associations, accessible names for icon-only controls, `aria-expanded`/`aria-controls`, dialog semantics, `aria-live` result feedback, and text/icon labels for status colors.
6. Audit visual states in light/dark and custom themes. Use the documented `--theme-*` variables, not fixed neutral/color substitutions that break theme support. Respect reduced motion; state feedback must remain visible with animation minimized.
7. Do a bounded visual QA pass: desktop and mobile screenshots in both themes, then one batched correction pass, then one confirmation pass. Record observed differences and intentional improvements.

## Acceptance criteria

- UI primitives look and behave consistently across migrated pages.
- All documented critical mobile/accessibility issues are fixed or explicitly deferred with a reason and owner.
- No migration introduced theme regressions, focus loss, inaccessible feedback, or color-only status.
