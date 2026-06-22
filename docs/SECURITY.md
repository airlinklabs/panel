# Modrinth Store — Security Model

## Threat Model

The Modrinth Store addon handles:

1. **External API calls** to Modrinth (api.modrinth.com) — user-controlled search queries, project IDs, version IDs
2. **File downloads** from Modrinth CDN — mod files, modpack archives, override files
3. **File uploads** to game servers via the panel's daemon — writes files to server directories
4. **User input** — search queries, server IDs, project/version IDs, admin settings
5. **Database operations** — cache storage, installation records, settings

## Security Controls

### Authentication & Authorization

- **All routes require session authentication** via `security.requireAuth()` applied at the router level
- **Admin routes** (config, cache clear, statistics) additionally check `user.isAdmin`
- **Server ownership** verified before install/uninstall operations — users can only modify their own servers (admins can modify any)
- **Admin sidebar item** hidden from non-admin users via `isAdminItem: true`

### CSRF Protection

- **All mutating routes** (POST, DELETE, PUT) use `security.requireCsrf()` middleware
- **GET routes** are exempt (stateless reads)
- CSRF token provided by the panel's `csrfProtection` middleware via Double Submit Cookie pattern

### Input Validation

| Input | Validation |
|-------|-----------|
| Search query | Max 200 chars, stripped of `<>"'`;` |
| Project/Version ID | Regex: `^[a-zA-Z0-9_-]{1,64}$` |
| Server ID | UUID or numeric format only |
| Offset | Non-negative integer |
| Limit | Clamped to [1, 50] |
| Sort index | Whitelist: relevance, downloads, follows, newest, updated |
| Project type | Whitelist: mod, modpack, resourcepack, shader, datapack, plugin |

### Path Traversal Prevention

All file paths pass through `security.sanitizePath(baseDir, userPath)` which:

1. Resolves the path to an absolute path using `path.resolve()`
2. Attempts `fs.realpathSync()` to resolve symlinks
3. Verifies the resolved path starts with `baseDir + path.sep`
4. Returns `null` if the path escapes the base directory

**Enforced in:**
- `DaemonClient.uploadFile()` — destination path
- `DaemonClient.deleteFile()` — file path
- `DaemonClient.mkdir()` — directory path
- `DaemonClient.listFiles()` — directory path
- `Installer.installModpack()` — override file paths
- `Installer.uninstallMod()` — file deletion path

### URL Validation

All external URLs validated via `security.validateUrl(url, allowedDomains)`:

- **Protocol must be HTTPS** — no HTTP, no file://, no data:
- **Domain must be in allowlist** — api.modrinth.com, cdn.modrinth.com, modrinth.com
- **Applied to:** all Modrinth API calls, all file downloads, all project links

### Zod Schema Validation

All Modrinth API responses validated against Zod schemas before use:

- `ModrinthSearchResponseSchema` — validates search results
- `ModrinthProjectSchema` — validates project data
- `ModrinthVersionSchema` — validates version data

Schema validation failures throw `ZodError` which is caught and logged (not retried).

### SQL Injection Prevention

- **No raw SQL with string interpolation** — all database operations use `$executeRaw` tagged template literals or `$queryRaw` with parameterized values
- **Migration SQL validated** — addon migrations checked against `ALLOWED_MIGRATION_SQL` regex before execution (only CREATE TABLE, CREATE INDEX, ALTER TABLE, DROP allowed)
- **Rollback SQL validated** — same regex check on downgrade migrations

### XSS Prevention

- **EJS `<%= %>` auto-escapes** — all dynamic content in templates uses escaped output
- **Server-side markdown rendering** — project body rendered server-side (not injected via `<script>` tag)
- **No `innerHTML` with user data** — progress/error messages use `textContent` in client-side JS
- **`escapeHtml()` / `escapeJsString()` utilities** available for any raw output needs

### Rate Limiting

- **Modrinth API rate limits** handled via `Retry-After` header parsing
- **429 responses** trigger exponential backoff (not immediate retry)
- **Request timeouts** — 15s for API calls, 60s for file downloads, 30s for daemon requests

### Supply Chain

- **No CDN scripts without SRI** — all external scripts (if any) must have integrity hashes
- **Dependencies audited** — minimal dependency tree (adm-zip, zod)
- **No `npx` execution** — Tailwind build uses local binary

## Known Limitations

1. **In-memory progress tracker** — progress data lost on addon restart (acceptable for UX)
2. **SQLite cache** — not shared across panel instances (single-instance deployment only)
3. **No file size limits on downloads** — large modpacks could consume memory (mitigation: streaming where possible)
4. **Client-only mod detection** — heuristic-based (list of known client mods), may miss some
