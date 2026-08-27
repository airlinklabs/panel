# Example fix for #75

The Client API must authorize every server-scoped operation after resolving server membership. Membership is not an operation permission.

## Target flow

```text
API credential
  -> user
  -> server
  -> owner OR subuser membership
  -> required permission for this operation
  -> daemon/database action
```

## Suggested authorization context

Refactor the current server resolver so it returns the membership context instead of only `server`:

```ts
type ServerAccess = {
  server: Server;
  isOwner: boolean;
  subUser: SubUser | null;
};
```

Then introduce a single operation guard:

```ts
function requireServerPermission(access: ServerAccess, permission: string) {
  if (access.isOwner) return;
  if (!access.subUser || !hasSubUserPermission(access.subUser.permissions, permission)) {
    throw new ClientApiError(403, 'permission denied');
  }
}
```

Do not create a second permission vocabulary. Reuse the existing canonical subuser permission parser/wildcard behavior.

## Required audit

Review every endpoint in `src/modules/api/client/clientApi.ts`, including reads and mutations:

- files: list/read/write/delete/rename
- power actions
- console/command operations
- backups: list/create/delete
- schedules: list/create/update/delete

Each route should have an explicit permission mapping in code.

## Security invariant

A subuser with server membership but no permission must fail before any daemon request or database mutation occurs.

Authorization should be evaluated against the current membership record on each request unless a deliberately short-lived authorization cache is introduced with invalidation on membership changes.

## Tests

Add a parameterized matrix covering owner, permitted subuser, denied subuser, deleted subuser, and non-member. Assert that denied requests do not invoke daemon/database side effects.
