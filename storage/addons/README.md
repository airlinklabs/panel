# AirLink Panel Addons

This directory contains addons for AirLink Panel. Addons extend the panel with custom features, routes, and UI.

## Creating an Addon

1. Create a new directory here with your addon's slug
2. Create a `package.json` with the v2 manifest format
3. Create an `index.ts` entry point
4. Restart the panel or click "Reload" in the admin

## Addon Structure

```
my-addon/
├── package.json       # v2 manifest
├── index.ts           # Entry point
├── views/             # EJS templates
│   ├── desktop/
│   └── mobile/
├── public/            # Static assets
└── lib/               # Additional modules
```

## Package.json (v2 Manifest)

```json
{
  "name": "My Addon",
  "identifier": "my-addon",
  "version": "1.0.0",
  "description": "Description",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-addon",
  "engines": { "panel": ">=1.0.0" },
  "permissions": ["addon.my-addon.view"],
  "capabilities": { "runsRawSql": true },
  "settingsSchema": [
    { "key": "greeting", "type": "string", "label": "Greeting", "default": "Hello!" }
  ],
  "dependencies": [],
  "migrations": [
    { "name": "create_table", "sql": "CREATE TABLE IF NOT EXISTS ...", "down": "DROP TABLE IF EXISTS ..." }
  ]
}
```

## Entry Point

```typescript
import { Router } from 'express';
import path from 'path';

export default function (router: Router, api: any) {
  const { logger, prisma, config, ui, commands, permissions, middleware } = api;

  // Register permissions
  permissions.register('addon.my-addon.view');

  // Register commands
  commands.register({ name: 'hello', description: 'Say hello', handler: () => 'Hello!' });

  // Register slots
  ui.registerSlot('dashboard.home.afterContent', () => '<div>My content</div>');

  // Read settings
  const greeting = await config.get('greeting');

  // Define routes
  router.get('/', async (req, res) => {
    res.render(path.join(api.viewsPath, 'index.ejs'), { user: req.session?.user });
  });

  // API route with auth
  const apiRouter = Router();
  apiRouter.get('/data', middleware.apiValidator('addon.my-addon.view'), (req, res) => {
    res.json({ success: true });
  });
  api.registerRoute('/my-addon/api', apiRouter);

  // Return lifecycle hooks
  return {
    onInstall: () => logger.info('Installed'),
    onEnable: () => logger.info('Enabled'),
    onDisable: () => logger.info('Disabled'),
    onUpdate: (prev) => logger.info(`Updated from ${prev}`),
    onUninstall: async () => { await config.deleteAll(); },
  };
}
```

## Key Concepts

- **Settings**: Use `api.config.get/set/delete` — no custom tables needed for config
- **Slots**: Use `api.ui.registerSlot()` to inject content into panel pages
- **Commands**: Use `api.commands.register()` for admin-triggered actions
- **Scheduler**: Use `api.schedule.register()` for periodic tasks
- **Permissions**: Namespaced as `addon.<identifier>.*`
- **Static Assets**: Place in `public/`, served at `/addon-assets/<identifier>/`
- **Lifecycle Hooks**: Return an object with `onInstall`, `onEnable`, `onDisable`, `onUpdate`, `onUninstall`
- **Dependencies**: Declare in `dependencies` array, loaded in order
- **Version Check**: Use `engines.panel` for compatibility warnings

## Reference Addon

See `reference-addon/` for a complete working example that exercises every v2 capability.

## Security

**Addons are not sandboxed.** Only install from trusted sources. See `docs/addons.md` for the full trust model.
