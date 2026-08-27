# Example fix for #76

## Runtime validation

Replace security-sensitive `z.unknown()` values followed by TypeScript casts with actual Zod primitives.

Example:

```ts
export const writeFileBodySchema = z.object({
  file: z.string().min(1),
  content: z.string(),
});
```

Do the same for delete/rename/backup name fields. Preserve legacy error messages with `refine`/`superRefine` only where compatibility requires them, but ensure the resulting values are genuinely typed at runtime.

## Path policy

Every Client API file operation should use the same normalization and traversal checks as the server UI before reaching `daemonRequest()`.

```text
untrusted JSON
 -> Zod parse
 -> normalizePath
 -> isPathSafe
 -> operation authorization
 -> daemonRequest
```

Do not rely on daemon-side checks as the only defense.

## Size controls

Set explicit maximum lengths for path/name fields and an explicit content/request limit. Large file-content writes should not be allowed to create an unbounded JSON/string memory allocation.

## Tests

Add schema tests for null, number, boolean, array, object, empty, oversized, and valid values. Add integration tests proving traversal/absolute paths are rejected before any daemon call and valid paths are normalized identically to the main file UI.
