# Example fix for #74: authenticate node-stats WebSocket upgrades

This branch is an example scaffold for issue #74. It intentionally documents the required security flow rather than claiming that an unverified patch is production-ready.

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

The current implementation checks only that a `connect.sid` cookie exists. That check is not authentication.

## Suggested implementation

Expose a reusable helper that resolves the same session data used by Express:

```ts
async function resolveWebSocketSession(req: IncomingMessage) {
  const sid = extractSessionId(req);
  if (!sid) return null;

  const session = await loadSessionFromStore(sid);
  if (!session?.user?.id) return null;

  const user = await prisma.users.findUnique({ where: { id: session.user.id } });
  return user ? { user, sessionId: sid } : null;
}
```

The upgrade handler should authenticate and authorize before calling `handleUpgrade()` or opening the daemon connection. The requested node must be included in the authorization decision.

## Security invariant

A request with a fabricated session ID or no permission for the requested node must never reach the daemon connection layer. This should be asserted directly with mocks/spies in tests.

## Tests

Mock the daemon connection and verify it is never called for:

- missing cookie
- malformed cookie
- fabricated session ID
- expired/revoked session
- disabled user
- unauthorized node
- nonexistent node

Add a successful authorized upgrade case and a regression test proving logout/revocation blocks a later upgrade.

## Acceptance criteria

- [ ] Session ID is resolved through the real session store.
- [ ] User/account state is verified before upgrade.
- [ ] Node access is checked before `handleUpgrade()`.
- [ ] Stored node credentials are never used for unauthorized callers.
- [ ] Tests cover forged sessions and unauthorized node access.
