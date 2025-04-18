# AirLink Panel Addons

This directory contains addons for AirLink Panel. Addons can extend the functionality of the panel with custom features.

## Creating an Addon

1. Create a new directory in this folder with your addon's slug (e.g., `my-addon`)
2. Create a `package.json` file with your addon's metadata
3. Create an entry point file (default: `index.ts`)
4. Implement your addon's functionality

## Addon Structure

```
my-addon/
├── package.json
├── index.ts
└── views/
    └── my-view.ejs
```

## Package.json Format

```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "description": "Description of my addon",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-addon",
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
    }
  ]
}
```

## Database Migrations

Addons can define database migrations in the `package.json` file. These migrations are automatically applied when the addon is enabled.

Each migration should have:
- `name`: A unique name for the migration
- `sql`: The SQL statement to execute

Migrations are applied in the order they are defined in the array. Once a migration has been applied, it will not be applied again, even if the addon is disabled and re-enabled.

For more information about migrations, see the [addon-migrations.md](../docs/addon-migrations.md) documentation.

## Entry Point

The entry point file (default: `index.ts`) should export a function that takes a router and an API object:

```typescript
import { Router } from 'express';

interface AddonAPI {
  registerRoute: (path: string, router: Router) => void;
  logger: any;
  prisma: any;
  addonPath: string;
  viewsPath: string;
  renderView: (viewName: string, data?: any) => string;
  getComponentPath: (componentPath: string) => string;
  // ... other API methods
}

export default function(router: Router, api: AddonAPI) {
  const { logger, prisma } = api;

  logger.info('My Addon initialized');

  router.get('/', async (req, res) => {
    res.render(path.join(api.viewsPath, 'my-view.ejs'), {
      user: req.session?.user,
      req,
      settings: await prisma.settings.findUnique({ where: { id: 1 } }),
      components: {
        header: api.getComponentPath('views/components/header'),
        template: api.getComponentPath('views/components/template'),
        footer: api.getComponentPath('views/components/footer')
      }
    });
  });
}
```
