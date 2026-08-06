# Phase 5 Report — Backend Error Sanitization (B-001..B-014)

## Goal
Stop raw internal errors — daemon/Docker paths, mysql hostnames, S3 keys, view paths, stack traces — from reaching the browser, while preserving the panel-daemon API contract for user-facing validation messages.

## Deliverable
New shared sanitizer `src/utils/errors.ts`:
- `ErrorCategory` = daemon / database / filesystem / network / validation / unknown, classified by marker lists.
- `sanitizeError(error, { fallback, hint })` -> `{ category, safeMessage, hint, debug }` (debug is log-only).
- `safeClientMessage(error, fallback)` — fixed safe message for client responses. Never contains internals.
- `daemonMessage(body, fallback)` — relays a trusted daemon structured `error`/`message` field verbatim (HMAC peer API contract). Rejects non-string/empty values.
- `errorBody(error)` — extracts the `.body` attached to a thrown HTTP/daemon error.
- `isProductionPosture()` — strict production flag; unset NODE_ENV treated as production-safe so a missing .env cannot leak internals to visitors.

## Principle applied
- **Trusted daemon fields** (`response.data.error/message`, thrown `error.body.error`): relayed verbatim. The daemon is an HMAC-signed peer; its error body is a curated string authored by our own handlers. The rename contract (`Invalid name` with daemon status 422) is codified in `tests/filesBackend.test.ts` and enforced.
- **Panel-local exceptions** (`err.message`, `del.message`, `'...: ' + error.message` appends): sanitized to a fixed message; raw detail goes to `logger.error` only.
- **Raw object dumps** (`details: response.data`, `details: inner.body`, `details: errBody`, `JSON.stringify(response.data)`): removed.

## Fixes
- B-001 `shared.ts:startServerContainer` throws safe message with `cause` = raw detail; `console.ts` power-action catch uses `safeClientMessage`.
- B-002 `console.ts` install/status poll error sanitized.
- B-003 `files.ts` zip/unzip/duplicate/rename/delete/upload/URL-pull: daemon fields via `daemonMessage`, local exception fallbacks removed, `details:` dumps dropped.
- B-004 `backups.ts` create/restore/download sanitized.
- B-005 `app.ts` view render errors gated by `isProductionPosture()`.
- B-006 user `databases.ts` (connect/remove/rotate) + v1 `api.ts` 502 db relays sanitized.
- B-007 v1 `api.ts` create-backup / restore-backup / update-startup relays sanitized (dead `err` casts removed).
- B-008 admin `servers.ts` delete no longer embeds `JSON.stringify(response.data)`; `?force=true` hint; raw detail logged only.
- B-009 `errorPages.ts` detail gated by `isProductionPosture()`.
- B-010 `account.ejs` `post()` returns parsed `error`/`message` or `'Request failed'` — never raw body.
- B-011 `serverTransfer.ts` (4 sites) + admin `servers.ts` transfer start/status relays sanitized; admin `nodes.ts` weak-reach fallback drops raw cause; admin `databases.ts` auto-bucket + `testDatabaseHost` result error + S3 test (`settings.ts`) sanitized via `safeClientMessage`.
- B-012 `addonManifest.ts` error strings reference the addon slug, not the absolute `filePath`.
- B-013 log redaction: deferred (server-side only, out of the browser error path).

## Validation gate (all green)
- tsc (main + prisma + tui configs): pass
- vitest: 224/224 (20 files) — includes the `filesBackend` rename contract that drove the `daemonMessage` design
- EJS compile: 75/75 views
- `eslint src`: exactly at pre-existing baseline (544 errors / 1167 warnings); `src/utils/errors.ts` clean after fixing the 9 `curly` findings
- impeccable detector: 0 findings
