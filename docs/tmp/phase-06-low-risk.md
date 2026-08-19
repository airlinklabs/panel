# Phase 06 — migrate low-risk page families in waves

## Goal

Convert conventional pages first, proving the system on real production routes while keeping visual and route parity.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- Phase 04 vertical-slice evidence and Phase 05 component ledger

## Recommended waves

1. Auth/account adjuncts: 2FA setup/verify, password reset, simple profile actions. Preserve form POST fallback and rate-limit/security behavior.
2. Admin list/detail CRUD: users, API keys, databases, images metadata, locations/mounts, addons settings where no specialist picker is involved.
3. User dashboard, credits, account, and my-images only after their smaller actions are stable. Keep dashboard drag/drop as a separately mounted island.
4. Server secondary pages without live streams: subusers, databases, players, worlds, startup values, settings, backups. Convert one route at a time; backups with long-running work use explicit polling/status fragments, not optimistic local state.

## Per-page procedure

1. Map existing controls, raw fetches, inline script scopes, route calls, and state matrix before editing.
2. Extract the page shell from the replaceable content. Reuse the visual classes/tokens and shared partials; remove page-only inline CSS by moving true reusable rules to `public/tw.css` and narrowly scoped rules to a stylesheet.
3. Extract the view model and fragment(s); implement one user task end to end, then the next. Do not convert a page to half HTMX and half duplicate fetch logic for the same feature.
4. Move local behavior to an Alpine component or island module based on Phase 05. Move no domain data into Alpine.
5. Delete migrated inline logic and unused page JS in the same change when no consumer remains. Search for every function/selector before deletion.
6. Verify all meaningful states: permission denied, empty, loading/submitting, malformed input, server/daemon error, success, disabled control, mobile, keyboard, dark theme.

## UX and visual invariants

- Keep status labels alongside status colors.
- Preserve compact table/card responsive behavior; fix documented overflow issues as each surface is touched.
- Keep button/input/card classes from `public/tw.css`; do not introduce an alternative component vocabulary.
- Use server-rendered empty/error panels and existing toast/modal patterns, converging them on their selected owners.

## Acceptance criteria per wave

- No raw `fetch` remains for a migrated task unless it is a documented specialist island.
- No script in the page relies on `ALMount`, Turbo events, or a global page remount for migrated behavior.
- Full route tests and task-level browser checks pass, and the migration log lists remaining exceptions.
