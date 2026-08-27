# Example fix for #81

The current `isAuthenticated(true, permission)` signature is ambiguous because the admin branch can return before evaluating `permission`.

## Recommended API

Split authentication, administrator status, and permission checks into explicit steps:

```ts
isAuthenticated(),
requireAdmin(),
requireAdminPermission('airlink.admin.nodes.view')
```

Or expose one helper for granular admin permissions:

```ts
requireAdminPermission('airlink.admin.nodes.view')
```

The important invariant is that a permission string supplied by a route must never be silently ignored.

## Audit

Search all uses of `isAuthenticated(true, ...)` and classify them as either unrestricted administrator-only routes or routes that require a specific permission. Pay special attention to destructive operations such as user deletion, node deletion, credential management, addon management, and settings changes.

If the intended model is that every administrator is unrestricted, remove the misleading granular permission arguments instead of keeping a permission system that has no effect.

## Tests

Test normal users, administrators with the required permission, administrators without it, administrators with unrelated permissions, and wildcard permissions. Add representative route tests for both read and destructive actions.
