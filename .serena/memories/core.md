# Core — Airlink Panel source map

Game-server management panel (Pterodactyl-like). One panel controls many remote **node daemons**.
Analyzed on branch `fix-dogshit-ui` (HEAD 44aa20f2, v2.6.0 rewrite in progress).

## Entrypoint & boot order — `src/app.ts` (612 L)
`loadEnv()` → `getConfig()` (throws ⇒ exit 1) → static mounts → `expressWs(app)` →
helmet/CSP+nonce → IP ban + global Redis rate limit → express-session → body parsers →
`initI18n()`+`i18nMiddleware` → `templateConfigMiddleware` → CSRF gate → view locals →
`installRenderResolver` → `errorPageHandler` → async IIFE: `databaseLoader` → `seedDefaultRoles` →
`settingsLoader` → `initializeDefaultUIComponents` → `loadModules` → `loadAddons` →
`validationErrorBoundary` → `notFoundHandler` → `errorPageHandler` → `app.listen` →
workers (`startPlayerStatsCollection`, `startScheduler`, `reenqueueQueuedInstalls`, `initEggCatalogue`,
`attachNodeStatsWs`) → graceful shutdown.

## Routing contract (CRITICAL)
- Modules are **statically listed** in `src/modules/registry.ts` `candidates` (:86-122). No FS discovery.
  Not in that list ⇒ never mounted. Registry order = route precedence.
- Contract: `export default { info: {name,description,version,moduleVersion,author,license}, router: (applyWs?) => Router }`
  (`src/handlers/moduleInit.ts`). `info.version` **major must equal panel major** or `modulesLoader` skips it.
- Router uses **absolute paths**; loader does `app.use(router)` (`modulesLoader.ts:39-42`).
- WS: call `applyWs(router)` **before** `router.ws(...)`.
- Render: `res.render('<dir>/<name>', {pageLocals})` — `res.locals` supplies everything else.
  Layout = plain EJS include: first line `include('../../layouts/admin'|'user'|'auth', {title})`,
  last line `include('../../layouts/<x>-footer')`.

## Layer map
- `src/config/**` timeouts/limits/auth/mime/ui constants (env parsing lives in `config.ts` + `envLoader.ts`)
- `src/handlers/**` middleware, caches, queues, realtime, addon system, security utils
- `src/modules/**` route controllers (admin | api | auth | core | realtime | user) + dead `pages/` tree
- `src/services/**` business logic (server/node/backup/file/database/schedule/startup/subuser/role/settings)
- `src/utils/**` pure helpers (http, pathSecurity, ssrf, encryption, validation, errors)
- `views/**` EJS + `views/styles/**` CSS + `views/javascript/**` client JS
- `storage/prisma/schema.prisma` → generated to `src/generated/prisma`

## Two parallel HTTP clients to the daemon (do not confuse)
1. `src/handlers/utils/core/daemonRequest.ts` — **HMAC-signed v1** (canonical sorted query, timestamp+nonce, `X-Airlink-*`). Used by services + user/server + installQueue + scheduler + watchers. **No default timeout.**
2. `src/services/daemonService.ts` — `Authorization: Bearer <node.key>`, 30 s default. Used by `api/v2/**`. **Divergent daemon power path** (`/server/:uuid/power` vs `/container/start`) and bypasses the capacity queue.

## Invariants
- engines >=22, pnpm 11.20.0. TS `strict` + `noUncheckedIndexedAccess`, CommonJS → `dist/`.
- `src/generated`, `dist`, `public/.vite` gitignored — run `pnpm db:generate` before typecheck.
- Redis keys: `airlink:sess:*`, `airlink:usr:{id}` (session index), `airlink:cache:*`, `rl:*`, `airlink:runtime:*` (start queue), `airlink:realtime:events` (pubsub).
- Daemon endpoints: `/container/*`, `/fs/*`, `/minecraft/players`, `/nodestats`, `/containerstatus/:id`, `/containerevents/:id`.
- Prisma model `settings` is lowercase; all others PascalCase.

Related: `mem:frontend`, `mem:tech_stack`, `mem:conventions`, `mem:suggested_commands`, `mem:task_completion`, `mem:known_issues`.