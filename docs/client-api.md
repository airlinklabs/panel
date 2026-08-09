# Client API Reference

The client API is the browser-facing JSON API for managing servers with an API key. It is consumed by external clients that may persist and cache responses, so the shapes in this document are a stability contract.

Source of truth for shapes: `src/modules/api/client/dto.ts`. Request bodies are validated at runtime by Zod (via the shared validation boundary); responses are typed to the schemas there.

## Authentication

All `/api/client/*` routes require a valid API key presented through the standard API-key mechanism (`apiValidator`). The key must belong to a user (`userId` set); admin keys also work. Requests without a valid key are rejected before any handler runs.

## Versioning

Current version: `client-v1` (constant `CLIENT_API_VERSION` in `src/modules/api/client/dto.ts`), reported by:

```
GET /api/client
```

```json
{ "version": "client-v1", "endpoints": [ ... ] }
```

### Compatibility plan

- **Additive changes** (new endpoints, new optional fields, new members of existing enums) do not require a version bump. Existing clients keep working unchanged.
- **Breaking changes** (renaming or removing a field, changing a type, changing error shapes or status codes) require a new version, e.g. `client-v2`.
- A new version is delivered as a new introspection document and a documented migration path. The previous version is kept serving until the oldest still-supported client migrates, then removed in a later release.
- Error responses are stable and standardized: `{ message, error, errors: [{ field, message }] }` for validation failures (HTTP 400) and `{ error }` for domain failures. Clients should read `error` or `message` and ignore the rest.

## Endpoints

All responses are wrapped in a `data` envelope unless noted.

### List servers

```
GET /api/client/servers
```

**Response:** `{ data: ClientServer[] }` where `ClientServer` is:

| Field | Type | Notes |
|-------|------|-------|
| `UUID` | string | Server identifier |
| `name` | string | |
| `description` | string\|null | |
| `Installing` | boolean | |
| `Queued` | boolean | |
| `Suspended` | boolean | |
| `nodeId` | number\|null | |
| `createdAt` | string | ISO-8601 date |

Only servers owned by the API-key user are listed (subusers use the per-server routes).

### Get server

```
GET /api/client/servers/:id
```

**Response:** `{ data: ClientServer }` (same shape as above). The key holder must be the owner or a subuser of the server.

**Errors:** `404` "Server not found" when the key holder has no access.

### Power action

```
POST /api/client/servers/:id/power
Content-Type: application/json
```

**Body:** `{ "action": "start" | "stop" | "restart" | "kill" }`

**Response:** `{ message: string }`. Starting can be async through the runtime queue: returns `202` with `{ message: "Server queued to start (position N)" }` when the server is queued, otherwise `200`.

**Errors:**
- `400` — invalid `action`
- `403` — API key not tied to a user, or server is suspended
- `404` — server not found or no access
- `409` — power action blocked by node capacity

### List files

```
GET /api/client/servers/:id/files?dir=/path
```

**Response:** `{ data: FileEntry[] }`. Each entry: `{ name, type: "file"|"directory", extension: string|null, category: string|null, size: number }`. Returns an empty array on a failed/rate-limited daemon listing.

### Read file

```
GET /api/client/servers/:id/files/content?file=/path/to/file
```

**Response:** `{ data: string }` (raw file content).

**Errors:** `400` "file query parameter is required" when `file` is missing.

### Write file

```
POST /api/client/servers/:id/files/content
Content-Type: application/json
```

**Body:** `{ "file": "/path/to/file", "content": "string" }`

**Response:** `{ message: "File saved" }`

**Errors:** `400` "file and content are required".

### Delete file

```
DELETE /api/client/servers/:id/files
Content-Type: application/json
```

**Body:** `{ "file": "/path/to/file" }`

**Response:** `{ message: "File deleted" }`

**Errors:** `400` "file is required".

### Rename file

```
POST /api/client/servers/:id/files/rename
Content-Type: application/json
```

**Body:** `{ "file": "/path/to/file", "newname": "/path/to/new" }`

**Response:** `{ message: "File renamed" }`

**Errors:** `400` "file and newname are required".

### List backups

```
GET /api/client/servers/:id/backups
```

**Response:** `{ data: ClientBackup[] }`:

| Field | Type | Notes |
|-------|------|-------|
| `UUID` | string | |
| `name` | string | |
| `createdAt` | string | ISO-8601 date |
| `locked` | boolean | |
| `size` | string\|null | Byte count as a decimal string (safe across JSON clients) |

### Create backup

```
POST /api/client/servers/:id/backups
Content-Type: application/json
```

**Body:** `{ "name": "string" }`

**Response:** `{ data: { UUID, name } }`

**Errors:**
- `400` — "name is required", "Backup limit reached"
- `502` — daemon failed to create the backup

### Delete backup

```
DELETE /api/client/servers/:id/backups/:backupId
```

**Response:** `{ message: "Backup deleted" }`

**Errors:** `400` "Backup is locked"; `404` "Backup not found".

### List schedules

```
GET /api/client/servers/:id/schedules
```

**Response:** `{ data: ClientSchedule[] }`. Each schedule: `{ id, name, cron, enabled, nextRunAt: string|null, lastRunAt: string|null, createdAt: string, tasks: [{ id, action, payload, order }] }`.

### Create schedule

```
POST /api/client/servers/:id/schedules
Content-Type: application/json
```

**Body:** `{ "name": "string", "cron": "string", "action": "command"|"power"|"backup", "payload": "string" }` (`payload` optional; for `power`, it must be a JSON object with a valid `action`: start/stop/restart/kill).

**Response:** `{ data: ClientSchedule }`

**Errors:**
- `400` — "name, cron, and action are required"
- `400` — "action must be command, power, or backup"
- `400` — "power payload must include a valid action"

### Delete schedule

```
DELETE /api/client/servers/:id/schedules/:scheduleId
```

**Response:** `{ message: "Schedule deleted" }`

**Errors:** `400` "Invalid schedule ID"; `404` "Schedule not found".
