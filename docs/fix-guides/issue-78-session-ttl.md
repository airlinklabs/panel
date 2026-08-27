# Example fix for #78

`RedisSessionStore.set()` derives TTL from `sess.cookie.maxAge`, but `touch()` currently ignores the supplied session and always applies the seven-day default.

## Correct behavior

Use one TTL policy for both initial persistence and refresh:

```ts
touch(sid: string, sess: session.SessionData, callback?: () => void): void {
  const ttlSec = this.getTTL(sess);
  this.redis.expire(`${this.prefix}${sid}`, ttlSec)
    .then(() => callback?.())
    .catch(() => callback?.());
}
```

The implementation should also confirm that session activity is intended to be sliding expiration rather than an absolute lifetime. If an absolute maximum is desired, store the original expiry/issued timestamp and cap refreshes accordingly.

## Index consistency

The `airlink:usr:{userId}` set is also given a TTL during `set()`. Ensure its expiration cannot outlive the last valid session in a way that creates stale authorization/revocation state.

## Tests

Verify normal and remember-me sessions have the expected TTL after creation and after repeated `touch()` calls. Verify destroying/revoking a session cannot be undone by a later touch. Include index cleanup/expiration tests.
