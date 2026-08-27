# Example fix for #80

The repository should make CI exercise the same database family and migration path used by production.

## Target CI model

1. Start a real MySQL service compatible with production.
2. Set `DATABASE_URL` to that service.
3. Install dependencies.
4. Run `prisma migrate deploy` against a clean database.
5. Generate/verify Prisma client output.
6. Run type checks and tests.
7. Fail when migration artifacts or generated output are inconsistent.

Example service shape:

```yaml
services:
  mysql:
    image: mysql:8.4
    env:
      MYSQL_DATABASE: airlink
      MYSQL_USER: airlink
      MYSQL_PASSWORD: airlink
      MYSQL_ROOT_PASSWORD: root
```

The exact MySQL version should match the supported production version rather than blindly using `latest`.

## Migration policy

Use `prisma migrate dev` when creating migrations during development and commit the resulting migration directory. Use `prisma migrate deploy` in CI/deployment. Keep `db push` as a clearly documented local-only convenience, if retained.

A clean-database CI job should prove that version control contains enough migration history to reconstruct the schema from zero.

## Generated client

Choose one policy: either commit generated Prisma client output and verify it, or generate it deterministically in CI/build. Do not allow a stale generated tree to silently pass review.

## Acceptance checks

The PR should demonstrate a clean MySQL database migrating successfully from zero and running the normal test suite without switching database engines.
