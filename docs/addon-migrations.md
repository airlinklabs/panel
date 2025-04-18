# Addon Migrations

AirLink Panel allows addons to define database migrations in their `package.json` file. These migrations are automatically applied when the addon is enabled, allowing addons to create and modify database tables without requiring manual SQL execution.

## Table of Contents

1. [How It Works](#how-it-works)
2. [Defining Migrations](#defining-migrations)
3. [Migration Format](#migration-format)
4. [When Migrations Are Applied](#when-migrations-are-applied)
5. [Working with Migrated Tables](#working-with-migrated-tables)
6. [Best Practices](#best-practices)
7. [Common Migration Types](#common-migration-types)
8. [Example Addon with Migrations](#example-addon-with-migrations)
9. [Troubleshooting](#troubleshooting)

## How It Works

The addon migration system works as follows:

1. Migrations are defined in the addon's `package.json` file as an array of objects
2. When an addon is enabled, the system checks for migrations that haven't been applied yet
3. Each migration is executed in the order they are defined in the array
4. Successfully applied migrations are recorded in the `AddonMigration` table to prevent them from being applied again
5. If a migration fails, the addon will be disabled and an error message will be logged

## Defining Migrations

Add a `migrations` array to your addon's `package.json` file:

```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "description": "An example addon with migrations",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-addon",
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyAddonTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    },
    {
      "name": "add_description_column",
      "sql": "ALTER TABLE MyAddonTable ADD COLUMN description TEXT"
    }
  ]
}
```

## Migration Format

Each migration object must have:

- `name`: A unique name for the migration (used to track which migrations have been applied)
- `sql`: The SQL statement to execute

The `name` should be unique within your addon. It's used to track which migrations have been applied, so changing the name of an existing migration will cause it to be applied again.

## When Migrations Are Applied

Migrations are applied in the following scenarios:

1. **When an addon is first installed and enabled**: All migrations will be applied
2. **When a disabled addon is enabled**: Any migrations that haven't been applied yet will be applied
3. **When an addon is updated with new migrations**: Only the new migrations will be applied when the addon is next enabled

Migrations are not applied when:

1. An addon is disabled
2. An addon is already enabled and no new migrations are added

## Working with Migrated Tables

Since tables created by addon migrations are not part of the Prisma schema, you need to use raw SQL queries to interact with them:

```typescript
// Function to get all entries from your custom table
async function getEntries() {
  try {
    // Use raw query since this table is not in the Prisma schema
    const entries = await prisma.$queryRaw`
      SELECT * FROM MyAddonTable ORDER BY created_at DESC
    `;
    return entries;
  } catch (error) {
    logger.error('Error fetching entries:', error);
    return [];
  }
}

// Function to add a new entry
async function addEntry(name: string, description: string) {
  try {
    await prisma.$executeRaw`
      INSERT INTO MyAddonTable (name, description)
      VALUES (${name}, ${description})
    `;
    return true;
  } catch (error) {
    logger.error('Error adding entry:', error);
    return false;
  }
}
```

## Best Practices

1. **Use `IF NOT EXISTS` for tables**: Always use `IF NOT EXISTS` when creating tables to prevent errors if the table already exists
2. **Namespace your tables**: Prefix your table names with your addon name to avoid conflicts with other addons or the core panel (e.g., `MyAddon_Users` instead of just `Users`)
3. **Keep migrations small**: Each migration should make a single, focused change
4. **Use descriptive names**: Name your migrations descriptively (e.g., `create_users_table`, `add_email_column_to_users`)
5. **Order matters**: Migrations are applied in the order they appear in the array
6. **Test thoroughly**: Test your migrations in a development environment before releasing your addon
7. **Handle errors gracefully**: Your addon should handle the case where a table might not exist yet
8. **Document your schema**: Include documentation about your database schema in your addon's documentation

## Common Migration Types

### Creating a Table

```json
{
  "name": "create_my_table",
  "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
}
```

### Adding a Column

```json
{
  "name": "add_description_column",
  "sql": "ALTER TABLE MyTable ADD COLUMN description TEXT"
}
```

### Creating an Index

```json
{
  "name": "add_name_index",
  "sql": "CREATE INDEX IF NOT EXISTS idx_my_table_name ON MyTable(name)"
}
```

### Creating a Foreign Key

```json
{
  "name": "create_user_settings_table",
  "sql": "CREATE TABLE IF NOT EXISTS UserSettings (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, setting TEXT NOT NULL, value TEXT, FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE)"
}
```

## Example Addon with Migrations

Here's a complete example of an addon that uses migrations to create a table for storing user notes:

### package.json

```json
{
  "name": "User Notes",
  "version": "1.0.0",
  "description": "Add notes to users",
  "author": "AirLink Labs",
  "main": "index.ts",
  "router": "/user-notes",
  "migrations": [
    {
      "name": "create_notes_table",
      "sql": "CREATE TABLE IF NOT EXISTS UserNotes (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, note TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE)"
    },
    {
      "name": "add_category_column",
      "sql": "ALTER TABLE UserNotes ADD COLUMN category TEXT DEFAULT 'General'"
    },
    {
      "name": "add_category_index",
      "sql": "CREATE INDEX IF NOT EXISTS idx_user_notes_category ON UserNotes(category)"
    }
  ]
}
```

### index.ts

```typescript
import { Router } from 'express';
import path from 'path';

export default function(router: Router, api: any) {
  const { logger, prisma } = api;

  logger.info('User Notes addon initialized');

  // Function to get notes for a user
  async function getUserNotes(userId: number) {
    try {
      return await prisma.$queryRaw`
        SELECT * FROM UserNotes
        WHERE userId = ${userId}
        ORDER BY createdAt DESC
      `;
    } catch (error) {
      logger.error('Error fetching user notes:', error);
      return [];
    }
  }

  // Function to add a note
  async function addUserNote(userId: number, note: string, category: string = 'General') {
    try {
      await prisma.$executeRaw`
        INSERT INTO UserNotes (userId, note, category)
        VALUES (${userId}, ${note}, ${category})
      `;
      return true;
    } catch (error) {
      logger.error('Error adding user note:', error);
      return false;
    }
  }

  // Main page route
  router.get('/', async (req: any, res: any) => {
    try {
      if (!req.session?.user) {
        return res.redirect('/login');
      }

      const userId = req.session.user.id;
      const notes = await getUserNotes(userId);

      res.render(path.join(api.viewsPath, 'notes.ejs'), {
        user: req.session.user,
        req,
        notes,
        // ... other data
      });
    } catch (error) {
      logger.error('Error rendering notes page:', error);
      res.status(500).send('An error occurred');
    }
  });

  // ... other routes
}
```

## Troubleshooting

If a migration fails, the addon will be disabled and an error message will be logged. Check the server logs for details about the error.

### Common Issues

- **Syntax errors in SQL statements**: Double-check your SQL syntax
- **Table already exists**: Use `IF NOT EXISTS` when creating tables
- **Column already exists**: Check if you're trying to add a column that already exists
- **Missing references**: Make sure any tables or columns you reference actually exist
- **Permission issues**: Ensure the database user has permission to create tables and modify the schema

### Debugging Migrations

To see which migrations have been applied for your addon, you can query the `AddonMigration` table:

```typescript
const appliedMigrations = await prisma.$queryRaw`
  SELECT * FROM AddonMigration
  WHERE addonSlug = 'your-addon-slug'
  ORDER BY appliedAt
`;
console.log(appliedMigrations);
```

### Resetting Migrations

In development, if you need to reset migrations for an addon, you can manually delete the records from the `AddonMigration` table:

```typescript
await prisma.$executeRaw`
  DELETE FROM AddonMigration
  WHERE addonSlug = 'your-addon-slug'
`;
```

> **Warning**: Only do this in development environments. Resetting migrations in production can lead to data loss or corruption.
