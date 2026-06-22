# Addon Migrations

AirLink Panel addons can define database migrations in their manifest. Migrations are applied atomically and support rollback.

## Table of Contents

1. [How It Works](#how-it-works)
2. [Defining Migrations](#defining-migrations)
3. [Migration Format](#migration-format)
4. [When Migrations Are Applied](#when-migrations-are-applied)
5. [Rollback Migrations](#rollback-migrations)
6. [Working with Migrated Tables](#working-with-migrated-tables)
7. [Best Practices](#best-practices)

## How It Works

1. Migrations are defined in `package.json` as an array of objects
2. Each migration runs inside a transaction (DDL + bookkeeping together)
3. Applied migrations are recorded in the `AddonMigration` table
4. On uninstall, `down` migrations run in reverse order before files are deleted

## Defining Migrations

```json
{
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)",
      "down": "DROP TABLE IF EXISTS MyTable"
    }
  ]
}
```

## Migration Format

Each migration object has:

- `name` (required): Unique name within your addon
- `sql` (required): Forward SQL statement
- `down` (optional): Rollback SQL statement

## When Migrations Are Applied

- **First install**: All migrations run
- **Re-enable**: Pending migrations run
- **Version bump**: New migrations run
- **Not applied when**: Addon is disabled or already up to date

## Rollback Migrations

On full uninstall (via admin UI with confirmation):

1. Your `onUninstall` hook runs first (if declared)
2. If `down` SQL exists for applied migrations, they run in reverse order
3. `AddonMigration` records are deleted
4. Addon files are removed

Only reversible if you declare `down` SQL.

## Working with Migrated Tables

Use raw SQL since these tables aren't in the Prisma schema:

```typescript
const rows = await prisma.$queryRaw`SELECT * FROM MyTable`;
await prisma.$executeRaw`INSERT INTO MyTable (name) VALUES (${name})`;
```

## Best Practices

1. Always use `IF NOT EXISTS` / `IF EXISTS`
2. Namespace tables with your addon name
3. Keep migrations small and focused
4. Test migrations in development
5. Provide `down` SQL for reversible operations
6. Handle the case where tables don't exist yet in your addon code
