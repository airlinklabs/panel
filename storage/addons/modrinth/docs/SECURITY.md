# Modrinth Store — Security Model

## Threat Model

The Modrinth Store addon handles:

1. **External API calls** to Modrinth (api.modrinth.com) — user-controlled search queries, project IDs, version IDs
2. **File downloads** from Modrinth CDN — mod files, modpack archives, override files
3. **File uploads** to game servers via the panel's daemon — writes files to server directories
4. **User input** — search queries, server IDs, project/version IDs, admin settings
5. **Database operations** — cache storage, installation records, settings, collections, search history

## Security Controls

### Authentication & Authorization

- **All routes require session authentication** via `auth.createAuthMiddleware()` applied at the router level
- **Admin routes** (config, cache clear, statistics) additionally check `user.isAdmin` via `auth.createAdminMiddleware()`
- **Server ownership** verified before install/uninstall operations — users can only modify their own servers (admins can modify any)
- **Admin sidebar item** hidden from non-admin users via `isAdminItem: true`

### CSRF Protection

- **All mutating routes** (POST, DELETE, PUT) use panel's CSRF protection middleware
- **GET routes** are exempt (stateless reads)
- CSRF token provided by the panel's `csrfProtection` middleware via Double Submit Cookie pattern

### Input Validation

| Input | Validation |
|-------|-----------|
| Search query | Max 200 chars, stripped of `<>"'`;` via `validateSearchQuery()` |
| Project/Version ID | Regex: `^[a-zA-Z0-9_-]{1,100}$` via `validateProjectId()` / `validateVersionId()` |
| Server ID | Non-empty, max 100 chars via `validateServerId()` |
| Page number | Positive integer via `validatePageNumber()` |
| Project type | Whitelist: all, mod, modpack, resourcepack, shader, datapack, plugin via `validateProjectType()` |

### Path Traversal Prevention

All file paths pass through `DaemonClient.sanitizeFilePath()` which:

1. Normalizes the path using `path.normalize()`
2. Removes leading `../` sequences
3. Replaces special characters `<>:"|?*` with `_`
4. Removes `..` path segments
5. Removes leading `/` characters

**Enforced in:**
- `DaemonClient.uploadFileToServer()` — destination path
- `DaemonClient.deleteServerFile()` — file path
- `DaemonClient.createDirectory()` — directory path
- `Installer.installMrpack()` — override file paths

### URL Validation

All external URLs validated via panel's security utilities:
- **Protocol must be HTTPS** — no HTTP, no file://, no data:
- **Domain must be in allowlist** — api.modrinth.com, cdn.modrinth.com
- **Applied to:** all Modrinth API calls, all file downloads, all project links

### Zod Schema Validation

All Modrinth API responses validated against Zod schemas before use:

- `ModrinthSearchResponseSchema` — validates search results
- `ModrinthProjectSchema` — validates project data
- `ModrinthVersionSchema` — validates version data
- `ModrinthSearchHitSchema` — validates individual search hits

Schema validation failures throw `ZodError` which is caught and logged (not retried).

### SQL Injection Prevention

- **No raw SQL with string interpolation** — all database operations use `$executeRaw` tagged template literals or `$queryRaw` with parameterized values
- **Migration SQL validated** — addon migrations checked against panel's `ALLOWED_MIGRATION_SQL` regex before execution (only CREATE TABLE, CREATE INDEX, ALTER TABLE, DROP allowed)
- **Rollback SQL validated** — same regex check on downgrade migrations

### XSS Prevention

- **EJS `<%= %>` auto-escapes** — all dynamic content in templates uses escaped output
- **`escapeHtml()` / `escapeJsString()` utilities** available for any raw output needs
- **No `innerHTML` with user data** — progress/error messages use `textContent` in client-side JS

### Rate Limiting

- **Modrinth API rate limits** handled via `Retry-After` header parsing
- **429 responses** trigger exponential backoff (not immediate retry)
- **Request timeouts** — 15s for API calls, 60s for file downloads, 30s for daemon requests

### Supply Chain

- **Dependencies audited** — minimal dependency tree (adm-zip, axios, zod)
- **No CDN scripts without SRI** — all external scripts (if any) must have integrity hashes

## Known Limitations

1. **In-memory progress tracker** — progress data lost on addon restart (acceptable for UX)
2. **SQLite cache** — not shared across panel instances (single-instance deployment only)
3. **Client-only mod detection** — heuristic-based (list of known client mods), may miss some
