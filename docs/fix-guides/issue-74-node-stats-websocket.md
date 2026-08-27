# Example fix for #74: authenticate node-stats WebSocket upgrades

This document is an implementation guide for issue #74. The security boundary must be fixed before this endpoint is considered production-safe.

## Required flow

```text
HTTP Upgrade
  -> extract connect.sid using the same cookie semantics as Express
  -> resolve session from the configured session store
  -> resolve user
  -> validate account/session state
  -> load requested node
  -> verify node-view authorization
  -> upgrade WebSocket
  -> connect to daemon
```

The current implementation checks only that a `connect.sid` cookie exists. That check must not remain as an authentication decision.

## Suggested helper

Expose a small helper from the authentication/session layer so the HTTP and WebSocket paths share the same session semantics:

```ts
type WebSocketAuthContext = {
  userId: number;
  user: User;
  sessionId: string;
};

async function resolveWebSocketSession(req: IncomingMessage): Promise<WebSocketAuthContext | null> {
  const sid = extractSessionId(req);
  if (!sid) return null;

  const sess = await loadSessionFromStore(sid);
  if (!sess?.user?.id) return null;

  const user = await prisma.users.findUnique({ where: { id: sess.user.id } });
  if (!user) return null;

  return { userId: user.id, user, sessionId: sid };
}
```

Use the real repository session store rather than introducing a second Redis key format.

## Upgrade handler shape

The intended structure in `nodeStatsWs.ts` is:

```ts
server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/ws\/node\/(\d+)\/stats$/);
  if (!match) return;

  const nodeId = Number(match[1]);
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0) {
    rejectUpgrade(socket, 400, 'invalid node');
    return;
  }

  const auth = await resolveWebSocketSession(req);
  if (!auth) {
    rejectUpgrade(socket, 401, 'unauthorized');
    return;
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) {
    rejectUpgrade(socket, 404, 'node not found');
    return;
  }

  if (!(await canViewNode(auth.user, node))) {
    rejectUpgrade(socket, 403, 'forbidden');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, auth, node);
  });
});
```

The daemon connection must not be established until all checks have passed.

## Tests to add

The test suite should explicitly prove that a fabricated session ID cannot reach the daemon layer. Mock the daemon connection and assert it has zero invocations for every failed authentication/authorization case.

Required cases:

- missing cookie
- malformed cookie
- fabricated session ID
- deleted session
- expired session
- revoked session
- disabled user
- authenticated user without node access
- authenticated user accessing a different node
- valid authorized user
- nonexistent node

Also add a regression test for logout/revocation followed by a new WebSocket upgrade.
