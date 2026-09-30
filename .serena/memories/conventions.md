# Conventions

## Code style
- 2-space indent, single quotes, semicolons, `curly: all`, `prefer-const`, no `any` (ESLint error).
- `interface` not `type` for object shapes (`consistent-type-definitions`).
- Relative imports, no path aliases, **no barrels in practice**: `src/handlers/index.ts` and `src/handlers/utils/index.ts` are never imported from `src/` — everyone uses deep paths (`../handlers/utils/security/csrfProtection`).
- Catches: `error instanceof Error ? error.message : String(error)`.

## Route module pattern
```ts
import { Router } from 'express';
import type { Module } from '../handlers/moduleInit';

const module: Module = {
  info: { name: 'admin/foo', description: '', version: '2.6.0', moduleVersion: '2.6.0', author: '', license: 'MIT' },
  router: () => {
    const router = Router();
    // absolute paths, e.g. router.get('/admin/foo', guard, handler)
    return router;
  },
};
export default module;
```
Then **statically import it and append to `candidates` in `src/modules/registry.ts`** or it never mounts.
Sub-files that are not modules export `registerXRoutes(router: Router): void` and are called from a parent module.

## Guard patterns (chain in this order)
- `isAuthenticated()` logged in · `isAuthenticated(true)` admin · `isAuthenticated(true, 'airlink.admin.<area>.<action>')` granular (also call `registerPermission()` at module top level).
- Server-scoped: `isAuthenticatedForServer('id'), requireSubUserPermission('<perm>')` — perm must be in `SUBUSER_PERMISSIONS` (`src/handlers/utils/auth/serverAuthUtil.ts:11-57`). WS variant `isAuthenticatedForServerWS('id')`.
- `/api/v2`: `apiKeyOrSessionAuth('<cap>')` then `redisRateLimit` then the sub-router; inside use `requireUser`/`requireAdmin`/`resolveServer` from `api/v2/helpers.ts`.
- Session callers on non-GET need CSRF (`x-csrf-token` header or `_csrf` body). `Authorization: Bearer` is CSRF-exempt.

## Views
- Page file `views/<area>/<name>.ejs`: first line `include('../layouts/<layout>', { title })`, last line `include('../layouts/<layout>-footer')`.
- Use `res.locals` (`settings`, `user`, `csrfToken`, `nonce`, `t`, `icon`, `assetUrl`) — never re-fetch in handlers.
- Translations `<%= t('key') %>` / `<%= tn('key', n) %>`. Never hardcode user-facing strings.
- Components: `views/partials/ui/*.ejs`, included with locals, all defaults guarded.

## Permissions & security
- Strings: `airlink.admin.<area>.<action>`, `airlink.api.*`, `server.*`, `addon.<slug>.*`. owner/admin ⇒ `['*']`; others ⇒ `Role.permissions` JSON.
- **Three divergent `hasPermission` implementations**: `permissions.ts:122`, `roles.ts:66`, inline in `authUtil.ts:45,76`. Only `roles.ts` has the parent-group rule (files ⇒ files.read). Prefer `roles.ts`.
- Secrets derive from `SESSION_SECRET` (AES-256-GCM `utils/encryption.ts`, CSRF, `wsToken`). Daemon HMAC uses the **node key**, not `SESSION_SECRET`.
- Validate every daemon/API response with the Zod schemas in `src/types/daemon.ts` via `parseDaemonResponse`.
- Paths from users go through `isPathSafe` (`src/utils/pathSecurity.ts`); outbound URLs through `src/utils/ssrf.ts`.

## Background work
- Serial in-RAM lane: `queueer.addTask(fn)`. Capacity-aware start admission: `runtimeStartQueue.enqueueStart()`.
- Long ops progress: `startJob`/`getJob` (`src/handlers/jobRegistry.ts`).
- Emit realtime with `emitRealtime`/`serverEvent` (`src/handlers/realtime/events.ts`) — never throws.