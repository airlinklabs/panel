# Phase 07 — migrate server-management workflows

## Goal

Convert the largest normal CRUD workflows without breaking server safety, daemon contracts, or operational feedback.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- `docs/ui-repair/ownership-map.md` and the relevant existing server route tests

## Scope order

1. Server shell shared by all `views/user/server/*` pages.
2. Settings, startup, subusers, databases, backups, players, and worlds.
3. Schedules and file-browser controls, after the common patterns are established.

Manage/console and file editor remain in Phase 08.

## Work

1. Implement `serverPageShell.ejs` as described in `docs/ui-repair/ownership-map.md`, retaining the existing header, metadata, install banner, responsive tabs, breadcrumbs, and per-page main slot. Migrate one page first, then all consumers. Ensure exactly one server identity/context source is passed to the shell.
2. Define a server fragment namespace that includes server ID and purpose (for example `server-<id>-backups-region`) to prevent cross-server target collisions and make tests readable.
3. For server actions, server-side authorization and daemon requests remain inside their existing typed modules/services. Fragment rendering is an output concern; never move daemon credentials or logic into browser JavaScript.
4. Convert forms/actions to HTMX with non-HTMX form fallback where feasible. For destructive, power, and irreversible actions, retain explicit confirmation and clear result/error messages. Prevent duplicate submissions with disabled controls and idempotency/operation state where existing backends support it.
5. Long-running installation/backup/schedule actions need explicit states: queued, running, succeeded, failed, cancelled/unknown. Use a small status fragment that HTMX polls only while work is active, or consume a documented WebSocket invalidation event. Stop polling when the region is removed, job completes, user navigates away, or an error terminal state occurs.
6. Convert files list operations in a dedicated sub-wave: browse/breadcrumb, create/rename/delete, upload/download, archive actions, SFTP details, image viewer. The server remains authoritative for path validation and permissions. Keep uploads and drag/drop as island modules; HTMX can refresh the resulting listing.
7. Preserve and test path traversal protections, CSRF, safe daemon errors, stale-operation handling, and resource-release behavior. Existing tests such as `filesBackend`, `backupsBackend`, `operations`, `daemonContract`, and security tests are mandatory context.

## Acceptance criteria

- All normal server pages share one shell with no duplicated navigation/header markup.
- Server IDs cannot leak across fragment targets, operations, or browser history.
- A user can reload/back out during a long-running operation without false success, duplicate requests, leaked polling, or a dead page.
- File/backup/server security tests and visual/state checks pass.
