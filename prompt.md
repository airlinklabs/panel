# Airlink Panel + Daemon — Codex Fix Prompt

You are fixing a Node.js/TypeScript game server panel called Airlink.
The repo has two packages:
- `panel/` — Express panel (Prisma + SQLite, EJS views, session auth)
- `daemon/` — Express daemon (Docker control, runs on each node/VPS)

Fix every issue below in order. After each fix, explain what you changed and why in a single sentence comment. Do not refactor unrelated code.

---

## FIX 1 — Critical bug: SFTP host returns panel IP instead of node IP

**File:** `daemon/src/handlers/configure.ts`

**Problem:** The configure script extracts the hostname from the panel URL and saves it as `remote` in the daemon `.env`. `remote` is later returned as the SFTP host. On a remote node this means SFTP credentials point to the panel machine, not the node.

**Fix:** Remove the `remote` field from the configure script entirely. Do not write it to `.env`.

**File:** `daemon/src/handlers/sftp/sftpManager.ts`

**Fix:** Delete the line `const host = process.env.remote || "127.0.0.1"`. The host should no longer come from the daemon. Remove `host` from the `SftpCredential` interface and from the return value of `generateCredential`.

**File:** `panel/src/modules/user/sftp.ts`

**Fix:** After the daemon returns credentials, set `host` to `server.node.address` (already available in scope) instead of using `response.data.host`. Update the `upsert` and `create` calls to use this value.

---

## FIX 2 — Critical security: WebSocket userId spoofable via query string

**File:** `panel/src/handlers/utils/auth/serverAuthUtil.ts`

**Problem:** `isAuthenticatedForServerWS` resolves userId as:
```ts
const userId = req.session?.user?.id || +req.query.userId;
```
An unauthenticated caller passes `?userId=1` to impersonate any account including admins.

**Fix:** Remove the `|| +req.query.userId` fallback entirely. Only trust `req.session?.user?.id`. If there is no session user, close the WebSocket immediately.

```ts
const userId = req.session?.user?.id;
if (!userId) {
  ws.close();
  return;
}
```

Also remove the `/api/console/:id/:password` route in `panel/src/modules/user/serverConsole.ts` — the password-in-URL pattern is the only reason `query.userId` existed. If external console access is needed it should go through a proper token system.

---

## FIX 3 — High bug: install queue injects wrong port into all queued servers

**File:** `panel/src/modules/user/createServer.ts`

**Problem:** Inside the queueer task, the code loops over ALL `Queued: true` servers but injects `assignedPort` from the outer request closure, so every pending server gets the same port in `SERVER_PORT`.

**Fix:** Inside the loop, derive each server's own primary port from its `Ports` field instead of using `assignedPort`:

```ts
// Replace the line:
serverEnv.push({ env: 'SERVER_PORT', value: assignedPort });

// With:
let serverPort = assignedPort; // fallback
try {
  const parsedPorts = JSON.parse(server.Ports);
  const primary = parsedPorts.find((p: any) => p.primary);
  if (primary?.Port) {
    serverPort = parseInt(String(primary.Port).split(':')[0]);
  }
} catch { /* keep fallback */ }
serverEnv.push({ env: 'SERVER_PORT', value: serverPort });
```

---

## FIX 4 — High bug: node deletion orphans Docker containers on daemon

**File:** `panel/src/modules/admin/nodes.ts`

**Problem:** When `deleteInstances=true`, `prisma.server.deleteMany()` removes DB records but never tells the daemon to stop/remove the Docker containers. Containers keep running on the node with no panel control.

**Fix:** Before `prisma.server.deleteMany()`, fetch all servers on the node and send a DELETE request to each daemon. Wrap each daemon call in try/catch so a single unreachable daemon does not block the rest. Example:

```ts
if (deleteInstances) {
  const node = await prisma.node.findUnique({ where: { id: nodeId }, include: { servers: true } });
  if (node) {
    await Promise.allSettled(
      node.servers.map(server =>
        axios.delete(
          `${daemonSchemeSync()}://${node.address}:${node.port}/container`,
          {
            auth: { username: 'Airlink', password: node.key },
            data: { id: server.UUID },
            timeout: 8000,
          }
        )
      )
    );
  }
  await prisma.server.deleteMany({ where: { nodeId } });
}
```

---

## FIX 5 — High bug: server delete blocked when remote node is offline

**File:** `panel/src/modules/admin/servers.ts`

**Problem:** If the daemon is unreachable, the whole delete fails and the server stays in the DB forever with no recovery path.

**Fix:** Add a `?force=true` query param option that skips the daemon call and deletes only the DB record. In the normal path, catch all axios errors (not just 404) and surface a clear message. Example:

```ts
const force = req.query.force === 'true';

if (!force) {
  try {
    await axios.delete(/* daemon call */);
  } catch (error: any) {
    const isGone = error.response?.status === 404 ||
      error.response?.data?.error?.includes('not exist');
    if (!isGone) {
      res.status(500).send(`Daemon unreachable. Use ?force=true to remove from panel only.`);
      return;
    }
  }
}

await prisma.server.delete({ where: { id: serverId } });
```

Apply the same pattern to `panel/src/modules/user/createServer.ts` (the user self-delete route).

---

## FIX 6 — High security: installer container runs in host network mode

**File:** `daemon/src/handlers/instances/create.ts`

**Problem:** `createInstaller` sets `NetworkMode: "host"` giving install scripts full access to the host network stack. Malicious scripts can reach internal services.

**Fix:** Change to a named bridge network or the default bridge. Create the network if it does not exist:

```ts
// Replace:
NetworkMode: "host",

// With:
NetworkMode: "bridge",
```

If install scripts genuinely need internet access, bridge mode with the default Docker NAT provides that without exposing the host network.

---

## FIX 7 — High security: session secret falls back to Math.random()

**File:** `panel/src/app.ts`

**Problem:**
```ts
secret: process.env.SESSION_SECRET || Math.random().toString(36).substring(2, 15),
```
`Math.random()` is not cryptographically secure and resets on every restart, invalidating all sessions.

**Fix:** Throw a hard startup error if `SESSION_SECRET` is not set in production:

```ts
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET env var must be set in production.');
}
const secret = sessionSecret || 'dev-only-insecure-secret-change-me';
```

Also update `example.env` to include `SESSION_SECRET=` with a comment instructing the operator to generate one with `openssl rand -hex 32`.

---

## FIX 8 — High security: SFTP credentials stored in plaintext

**File:** `panel/prisma/schema.prisma` + `panel/src/modules/user/sftp.ts`

**Problem:** `SftpCredential.password` is stored as a plain string.

**Fix:** Hash the password with bcrypt before storing, and do not return the stored hash to the client — return the plaintext password only immediately after generation (before hashing). On credential retrieval (GET), return only the username, host, port, and expiry — never the password. If the user needs the password again, they must regenerate credentials.

In `sftp.ts` POST route, before the upsert:
```ts
import bcrypt from 'bcryptjs';
const hashedPassword = await bcrypt.hash(password, 12);
// store hashedPassword in DB, return plaintext password in response
await prisma.sftpCredential.upsert({
  ...
  update: { username, password: hashedPassword, host, port, expiresAt: ... },
  create: { serverId, username, password: hashedPassword, host, port, expiresAt: ... },
});
res.json({ username, password, host, port, expiresAt }); // plaintext, one-time
```

In the GET route, omit `password` from the response entirely.

---

## FIX 9 — Medium security: HMAC not enforced by default on daemon

**File:** `daemon/src/app/hmacMiddleware.ts`

**Problem:** Requests without HMAC headers pass through with only a log warning unless `REQUIRE_HMAC=true` is explicitly set. Most deployments won't set this.

**Fix:** Flip the default — enforce HMAC by default, allow bypass only when `REQUIRE_HMAC=false` is explicitly set:

```ts
// Replace the permissive-mode block:
if (!tsHeader || !sigHeader) {
  if (process.env.REQUIRE_HMAC === 'false') {
    logger.warn(`Unsigned request allowed (REQUIRE_HMAC=false): ${req.method} ${req.path}`);
    next();
    return;
  }
  logger.warn(`Rejected unsigned request: ${req.method} ${req.path} from ${req.ip}`);
  res.status(401).json({ error: 'Missing HMAC signature headers' });
  return;
}
```

Update `daemon/example.env` to document `REQUIRE_HMAC=false` as the opt-out, not opt-in.

---

## FIX 10 — Medium security: bcrypt cost factor inconsistent

**File:** `panel/src/modules/admin/users.ts`

**Problem:** Admin-created and admin-edited user passwords are hashed at cost 10 while self-registered users use cost 12.

**Fix:** Find all `bcrypt.hash(password, 10)` calls in `users.ts` and change them to `bcrypt.hash(password, 12)`.

---

## FIX 11 — Medium security: WebSocket to daemon always uses plain ws://

**File:** `panel/src/modules/user/serverConsole.ts`

**Problem:** All four WebSocket proxy routes hardcode `ws://` regardless of the `enforceDaemonHttps` setting.

**Fix:** Import `daemonSchemeSync` and map it to a WS scheme:

```ts
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';

function wsScheme(): 'ws' | 'wss' {
  return daemonSchemeSync() === 'https' ? 'wss' : 'ws';
}
```

Replace every `ws://${addr}:${port}/...` with `` `${wsScheme()}://${addr}:${port}/...` ``.

---

## FIX 12 — Medium bug: default storage unit mismatch

**File:** `panel/prisma/schema.prisma`

**Problem:** `defaultMaxStorage @default(5)` is almost certainly meant to be in MB but 5 MB is unusably small. The code fallback uses 5120 (5 GB).

**Fix:** Change the schema default to match the code fallback:

```prisma
defaultMaxStorage Int @default(5120)
```

Then create and run a migration: `npx prisma migrate dev --name fix_default_storage`.

---

## FIX 13 — Low bug: storage quota not enforced on daemon

**File:** `daemon/src/handlers/instances/create.ts`

**Problem:** `Storage` is passed from the panel to the daemon but never used in the Docker container config. Containers can write unlimited data.

**Fix:** Add a `DiskQuota` via Docker's `StorageOpt` if the storage driver supports it, or at minimum pass `Storage` through and log it as a soft limit. For drivers that support `overlay2` with quota:

```ts
// In the docker.createContainer call, inside HostConfig:
StorageOpt: Storage ? { 'size': `${Storage}m` } : undefined,
```

Add a comment noting this requires `overlay2` with `d_type=true` and `pquota` mount options. If the driver does not support it, the option is silently ignored — better than not being there at all.

---

## AFTER ALL FIXES

1. Run `npx tsc --noEmit` in both `panel/` and `daemon/` and fix any type errors introduced.
2. Run `npx prisma migrate dev` in `panel/` to apply the schema change from Fix 12.
3. Verify `panel/example.env` and `daemon/example.env` are updated to reflect new required env vars (`SESSION_SECRET`).
4. Do not alter any EJS view files, CSS, or unrelated route handlers.