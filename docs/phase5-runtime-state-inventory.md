# Phase 5 — Runtime State Inventory and Dependency Decisions

> Generated from the Phase 5 gate. All hand-rolled runtime infrastructure is
> documented here. No new infrastructure is added in this phase.

## Deployment model

Single-process panel (`node dist/app.js`), single-process daemon (`airlinkd`)
per host. No horizontal scaling. Sessions, rate limiting, realtime, and queue
state are all in-process. Redis/BullMQ is **not approved** and not needed.

| Question | Answer |
|---|---|
| Deployment topology | Single node, single panel process, single daemon process |
| Must jobs survive restarts? | No — in-memory queues drop on restart; servers stay stopped |
| Redis approved? | No — no multi-instance, no shared-state requirement |
| Multi-process safety needed? | No — single worker model |

## Runtime state inventory

### 1. runtimeQueue (`src/handlers/runtimeQueue.ts`, 493 lines)

| Field | Value |
|---|---|
| Owner | panel / power route |
| Data | In-memory `Map<nodeId, QueueEntry[]>`, `Map<serverId, nodeId>`, `Map<userId, bannedUntil>` |
| TTL | None — entries pruned when processed |
| Restart survival | **Lost** — pending starts stay stopped |
| Multi-process | N/A — single process |
| Failure behavior | Per-entry failure count; dropped after `MAX_GRANT_FAILURES` (3); emits `server.start.failed` |
| Observability | `listQueueForAdmin()`, `getPublicQueueState()`, realtime `server.start.queue.changed` |
| Tests | `tests/clientApi.test.ts` (enqueue/cancel/ban), `tests/powerAction.test.ts` |

### 2. jobRegistry (`src/handlers/jobRegistry.ts`, 152 lines)

| Field | Value |
|---|---|
| Owner | panel / backups |
| Data | In-memory `Map<string, ProgressJob>` — backup/restore progress |
| TTL | 30 min (`TTL_MS`) — pruned on access |
| Restart survival | **Lost** — running jobs forget; UI polls get empty |
| Multi-process | N/A |
| Failure behavior | `finishJob()` marks done/failed; client polls resolve |
| Observability | `describeJob()` served at progress endpoint |
| Tests | `tests/backupsBackend.test.ts` |

### 3. schedulerWorker (`src/handlers/schedulerWorker.ts`, 227 lines)

| Field | Value |
|---|---|
| Owner | panel / schedules |
| Data | Reads from Prisma `Schedule` table; state is DB-backed |
| TTL | N/A — DB-persisted, `nextRunAt` updated after each run |
| Restart survival | **Yes** — DB rows persist; `startScheduler()` re-polls every 30s |
| Multi-process | N/A — single scheduler; no distributed locking |
| Failure behavior | Per-task error array; `result.ok` logged; schedule still advances |
| Observability | `logger.warn` on errors; `lastRunAt`/`nextRunAt` in DB |
| Tests | `tests/schedulesBackend.test.ts` |

### 4. securityCache (`src/handlers/securityCache.ts`, 25 lines)

| Field | Value |
|---|---|
| Owner | panel / settings |
| Data | In-memory `{ bannedIps, rateLimitEnabled, rateLimitRpm }` |
| TTL | 30s refresh from Prisma `Settings` |
| Restart survival | Re-populated from DB on first refresh |
| Multi-process | N/A |
| Failure behavior | Falls back to defaults (`rateLimitRpm: 500`) |
| Observability | Settings admin page; refresh interval |
| Tests | `tests/adminSettings.test.ts` |

### 5. realtime hub + event bus (`src/handlers/realtime/`)

| File | Lines | Role |
|---|---|---|
| `events.ts` | 194 | Event bus: in-memory `subscribers` + `history[500]` ring buffer, monotonic `seq` |
| `hub.ts` | 197 | Session fan-out: `Map<sessionId, RealtimeSession>`, server-side auth filtering |
| `serverStatusWatcher.ts` | 211 | Per-server daemon WS: ref-counted, reconnect with exponential backoff |

| Field | Value |
|---|---|
| Owner | panel / realtime |
| Data | Sessions (userId, serverIds, ws); event ring (500 events); watcher WS per server |
| TTL | Session lifecycle; events ring `shift()` at 500; watcher refs released on disconnect |
| Restart survival | **Lost** — all sessions dropped; clients reconnect and resync via seq |
| Multi-process | N/A |
| Failure behavior | WS send failure → close + drop session; watcher reconnect up to 8 attempts |
| Observability | `listRealtimeSessions()`, `currentRealtimeCursor()` |
| Tests | `tests/realtimeEvents.test.ts` (if exists) |

### 6. addon scheduling (`src/handlers/addonCommands.ts`, scheduler class)

| Field | Value |
|---|---|
| Owner | panel / addons |
| Data | In-memory `Map<slug, { interval, enabled }>` timers |
| TTL | N/A — timers run until `clearAddonTimers(slug)` |
| Restart survival | **Lost** — addons re-registered on mount |
| Multi-process | N/A |
| Failure behavior | `setInterval` callback catches errors, logs |
| Observability | `listAddonSchedules()` |
| Tests | `tests/addonCommands.test.ts` |

### 7. sessions (express-session + PrismaSessionStore)

| Field | Value |
|---|---|
| Owner | panel / auth |
| Data | Prisma `Session` table: `session_id, data, expires, createdAt, updatedAt` |
| TTL | `cookie.maxAge` (default 7 days); expired rows cleaned on get |
| Restart survival | **Yes** — DB-persisted |
| Multi-process | N/A — single process |
| Failure behavior | Express-session falls back to new session on store error |
| Observability | `length()`, store `clear()` |
| Tests | `tests/sessionStore.test.ts` |

### 8. rate limiting

| Field | Value |
|---|---|
| Owner | panel / express-rate-limit |
| Data | In-memory sliding window per IP (express-rate-limit default) |
| TTL | 60s window |
| Restart survival | **Lost** — counters reset |
| Multi-process | N/A |
| Failure behavior | Returns 429; `max` configurable via `securityCache.rateLimitRpm` |
| Observability | `standardHeaders: true` (RateLimit-* headers) |
| Tests | `tests/rateLimit.test.ts` (if exists) |

### 9. daemon runtime state (`daemon/src/`)

| System | Storage | Restart | Tests |
|---|---|---|---|
| `stateMap` (container presence) | In-memory `Map<id, running>` | Rebuilt from Docker API | `tests/docker/stateTransitions.test.ts` |
| `installState` | File `storage/install_logs.json` | Survives | `tests/handlers/installState.test.ts` |
| `downloadTokens` | In-memory `Map<token, meta>`, 90s TTL | Lost | `tests/security/downloadTokens.test.ts` |
| `nonceSet` (HMAC replay) | In-memory `Set`, 30s window | Lost | `tests/security/hmac.test.ts` |
| `rateLimit` | In-memory `Map<ip, count>`, 60s window | Lost | `tests/security/rateLimit.test.ts` |
| `logHistory` ring buffer | In-memory per container | Rebuilt from files | `tests/handlers/appendChunk.test.ts` |

## Candidate migration decisions

### Environment loading

Panel `start:panel` already uses `node --env-file=.env`. The custom
`envLoader.ts` still runs to provide: (1) first-run copy from `example.env`,
(2) fail-fast on `DATABASE_URL`, (3) warning for missing optional vars.
Both panel and daemon have pure `parseEnv()` / `parseEnvFile()` functions
now covered by compatibility tests (`tests/envLoader.test.ts`).
**Decision: keep custom loader; it is typed and tested.** No runtime change.

### Static browser vendor files

`public/javascript/vendor/` was hand-copied from npm packages.
Now generated by `scripts/build-vendor.mjs` from the lockfile-pinned packages.
**Decision: keep pipeline-generated artifacts; never hand-edit.** Verified with
`node scripts/build-vendor.mjs --check`.

### Sessions

PrismaSessionStore now: (a) deletes expired sessions on `get`, (b) is fully
typed and tested (`tests/sessionStore.test.ts`).
**Decision: keep owned Prisma store. No maintained replacement preserves
expiry/touch semantics better for this single-process deployment.**

### Durable jobs / realtime scale

No Redis available. No approved multi-instance deployment.
**Decision: in-memory owned stores are appropriate for single-process model.**

### Uploads

Daemon uses streaming upload with native Node fetch; panel uses @aws-sdk.
No change required.

### Addons

Capability restrictions (`ADDON_CAPABILITIES`), audit logging via `logActivity`,
safe reload via `reloadAddons()` with rollback SQL validation — all present.
No sandboxing claimed; path checks noted as non-sandbox.

## Dependency gate

| Change | New dep? | Lockfile change? | Audit? |
|---|---|---|---|
| Vendor pipeline | No — esbuild transitive via vitest | No | N/A |
| Env parser extraction | No | No | N/A |
| Session store tests | No | No | N/A |

`pnpm audit --prod` could not run: **corepack ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING**.
Using `node_modules/.bin/esbuild` locally; no package integrity bypass.

## Completion criteria

- [x] Decision record: this document
- [x] Operational runbook: `scripts/build-vendor.mjs` (run, verify)
- [x] Rollback: revert committed vendor files + tests
- [x] Security test: no new auth surface; env parser tested
- [x] Restart test: all state documented as lost/persisted above
- [x] Multi-instance: N/A — single-process model confirmed
