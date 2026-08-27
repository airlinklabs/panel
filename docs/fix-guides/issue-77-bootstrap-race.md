# Example fix for #77

The first-user privilege transition must be atomic. Do not base a security decision on a standalone `users.count() === 0` query.

## Preferred model

Introduce a database-backed initialization state that can be claimed exactly once.

```text
installation state: uninitialized
        |
        | atomic claim
        v
initialization state: initialized
        |
        v
exactly one owner
```

A practical MySQL/Prisma design is a singleton bootstrap row with a unique key. The registration flow attempts an atomic insert/claim and only the transaction that succeeds can create the owner account.

## Transaction requirements

The bootstrap claim and privileged user creation must share one transaction. A failed owner creation must not leave the installation marked initialized, and a failed claim must not grant owner privileges.

Do not implement a process-local mutex as the only protection because multiple panel processes can race.

## Recovery policy

Document what happens if historical data contains users but no owner. Normal registration must not silently promote the next user to owner. Recovery should be a deliberate administrative operation.

## Tests

Run multiple concurrent registration requests against a clean database. Assert exactly one owner/admin bootstrap account and that every other successful registration receives normal privileges. Repeat the test several times and include transaction-failure/retry coverage.
