# AirLink Panel Addon System

This document is the primary reference for building addons for AirLink Panel. It covers the v2 manifest format, the full Addon API surface, lifecycle hooks, permissions, settings, slots, commands, scheduled tasks, and the security model.

## Table of Contents

1. [Trust Model](#trust-model)
2. [Addon Structure](#addon-structure)
3. [Manifest Format (v2)](#manifest-format-v2)
4. [Addon Entry Point](#addon-entry-point)
5. [The Addon API](#the-addon-api)
6. [Lifecycle Hooks](#lifecycle-hooks)
7. [Database Migrations](#database-migrations)
8. [Settings Store](#settings-store)
9. [Permissions](#permissions)
10. [UI Slots](#ui-slots)
11. [Commands](#commands)
12. [Scheduled Tasks](#scheduled-tasks)
13. [Static Assets](#static-assets)
14. [Dependencies](#dependencies)
15. [Version Compatibility](#version-compatibility)
16. [Managing Addons](#managing-addons)
17. [Backward Compatibility](#backward-compatibility)
18. [Reference Addon](#reference-addon)

## Trust Model

**Addons are not sandboxed.** An addon runs with full access to the panel's database, file system, and network. Installing an addon is equivalent to installing a dependency: only install from sources you trust. The panel provides namespace isolation for permissions, settings, and UI registrations, but this is organizational separation, not security sandboxing.

## Addon Structure

```
my-addon/
├── package.json       # Addon manifest (v2 format)
├── index.ts           # Main entry point
├── views/             # EJS templates
│   ├── desktop/       # Desktop-specific views
│   │   └── index.ejs
│   └── mobile/        # Mobile-specific views
│       └── index.ejs
├── public/            # Static assets (optional)
│   ├── css/
│   └── js/
└── lib/               # Additional modules (optional)
```

## Manifest Format (v2)

The `package.json` file defines your addon's metadata and configuration. Here's the complete schema:

```json
{
  "name": "My Addon",
  "identifier": "my-addon",
  "version": "1.0.0",
  "description": "What my addon does",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-addon",
  "enabled": true,
  "engines": {
    "panel": ">=1.0.0"
  },
  "permissions": [
    "addon.my-addon.view",
    "addon.my-addon.manage"
  ],
  "capabilities": {
    "wrapsDashboard": false,
    "wrapsAdminLayout": false,
    "runsRawSql": true,
    "registersSchedules": false
  },
  "settingsSchema": [
    {
      "key": "greeting",
      "type": "string",
      "label": "Greeting",
      "default": "Hello!",
      "description": "A greeting message"
    }
  ],
  "dependencies": [
    { "identifier": "other-addon", "range": ">=1.0.0" }
  ],
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)",
      "down": "DROP TABLE IF EXISTS MyTable"
    }
  ]
}
```

### Required Fields

- `name`: Display name of your addon
- `version`: Semver version string

### Optional Fields

- `identifier`: Machine identifier (lowercase letters, digits, hyphens; max 48 chars). Must match the folder name. If omitted, the folder name is used.
- `description`: Brief description
- `author`: Author name
- `main`: Entry point file (default: `index.ts`)
- `router`: Base URL path for your addon routes (default: `/`)
- `enabled`: Whether enabled by default (default: `true`)
- `engines.panel`: Panel version range this addon supports (e.g. `>=1.0.0`)
- `permissions`: Array of permission strings (must be namespaced as `addon.<identifier>.*`)
- `capabilities`: Declare risky capabilities your addon uses
- `settingsSchema`: Declarative settings for auto-rendered admin forms
- `dependencies`: Other addons required
- `migrations`: Database migrations with optional rollback SQL

## Addon Entry Point

The entry point exports a function that receives a router and the Addon API:

```typescript
import { Router } from 'express';
import path from 'path';

export default function (router: Router, api: any) {
  const { logger, prisma, config, ui, commands, schedule, permissions, middleware } = api;

  logger.info('My Addon initialized');

  // Register permissions
  permissions.register('addon.my-addon.view');

  // Register a command
  commands.register({
    name: 'hello',
    description: 'Prints hello',
    handler: () => 'Hello from My Addon!',
  });

  // Register a slot
  ui.registerSlot('dashboard.home.afterContent', () => {
    return '<div class="my-addon-banner">Hello from My Addon!</div>';
  });

  // Read/write settings
  const greeting = await config.get('greeting');

  // Define routes
  router.get('/', async (req, res) => {
    res.render(path.join(api.viewsPath, 'index.ejs'), {
      user: req.session?.user,
      req,
      settings: await prisma.settings.findUnique({ where: { id: 1 } }),
    });
  });

  // Return lifecycle hooks (optional)
  return {
    onInstall: () => { logger.info('Installed!'); },
    onEnable: () => { logger.info('Enabled!'); },
    onDisable: () => { logger.info('Disabled!'); },
    onUpdate: (prev) => { logger.info(`Updated from ${prev}`); },
    onUninstall: async () => { await config.deleteAll(); },
  };
}
```

## The Addon API

The `api` object provides:

```typescript
interface AddonAPI {
  // Core
  registerRoute: (path: string, router: Router) => void;
  logger: Logger;
  prisma: PrismaClient;
  addonPath: string;
  viewsPath: string;
  desktopViewsPath: string;
  mobileViewsPath: string;
  renderView: (viewName: string, data?: any, isMobile?: boolean) => Promise<string>;
  getComponentPath: (componentPath: string) => string;
  assetsUrl: string;

  // Component Resolution (new in v2.1)
  getComponent: (name: string, viewport?: 'desktop' | 'mobile' | 'auto') => string | null;
  getComponents: (viewport?: 'desktop' | 'mobile' | 'auto') => Record<string, string>;

  // Settings
  config: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    getMany(keys: string[]): Promise<Record<string, string | null>>;
    setMany(entries: Record<string, string>): Promise<void>;
    delete(key: string): Promise<void>;
    deleteAll(): Promise<void>;
    getAll(): Promise<Record<string, string>>;
  };

  // UI
  ui: {
    // Existing (unchanged from v1)
    addSidebarItem / removeSidebarItem / getSidebarItems;
    addServerMenuItem / removeServerMenuItem / getServerMenuItems;
    addServerSection / removeServerSection / getServerSections;
    addServerSectionItem / removeServerSectionItem / getServerSectionItems;

    // New in v2
    registerSlot(slotId: SlotId, render: (locals) => string | Promise<string>): void;
    unregisterSlot(slotId: SlotId): void;
    registerDashboardWrapper(render): void;
    unregisterDashboardWrapper(): void;
    registerAdminWrapper(render): void;
    unregisterAdminWrapper(): void;
  };

  // Commands
  commands: {
    register(command: { name: string; description: string; handler: (args: string[]) => Promise<string> | string }): void;
  };

  // Scheduler
  schedule: {
    register(task: { id: string; intervalMs: number; handler: () => Promise<void> | void }): void;
  };

  // Permissions
  permissions: {
    register(permission: string): boolean;
  };

  // Middleware (stable references)
  middleware: {
    isAuthenticated: typeof isAuthenticated;
    apiValidator: typeof apiValidator;
    csrfProtection: typeof csrfProtection;
  };
}
```

## Lifecycle Hooks

Your entry point can return an object with optional hooks:

| Hook | When Called |
|------|-----------|
| `onInstall` | First time addon is loaded (no DB record) |
| `onEnable` | Addon is toggled from disabled to enabled |
| `onDisable` | Addon is toggled from enabled to disabled |
| `onUpdate(previousVersion)` | Manifest version differs from DB record |
| `onUninstall` | Before addon files and records are deleted |

All hooks are error-isolated: a throwing hook logs an error but does not crash the panel.

## Database Migrations

```json
"migrations": [
  {
    "name": "create_table",
    "sql": "CREATE TABLE IF NOT EXISTS MyTable (...)",
    "down": "DROP TABLE IF EXISTS MyTable"
  }
]
```

- Migrations are applied atomically (DDL + bookkeeping in one transaction)
- The optional `down` SQL is executed on uninstall in reverse order
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotency

## Settings Store

```typescript
await config.set('greeting', 'Hello!');
const value = await config.get('greeting');
await config.delete('greeting');
```

Settings are namespaced per addon automatically. No custom SQL tables needed for simple config.

## Permissions

Declare permissions in your manifest:

```json
"permissions": ["addon.my-addon.view", "addon.my-addon.manage"]
```

Or register at runtime:

```typescript
permissions.register('addon.my-addon.special');
```

All permissions must be namespaced as `addon.<your-identifier>.*`. The panel enforces this.

## UI Slots

Inject content into existing panel pages:

```typescript
ui.registerSlot('dashboard.home.afterContent', (locals) => {
  return '<div>My content here</div>';
});
```

### Available Slot IDs

| Slot ID | Location |
|---------|----------|
| `dashboard.home.beforeContent` | Dashboard, before main content |
| `dashboard.home.afterContent` | Dashboard, after main content |
| `dashboard.home.sidebar` | Dashboard sidebar area |
| `server.console.beforeContent` | Server console, before content |
| `server.console.afterContent` | Server console, after content |
| `server.console.commandRow` | Server console, command input row |
| `server.files.beforeContent` | Server files, before content |
| `server.files.afterContent` | Server files, after content |
| `server.backups.beforeContent` | Server backups, before content |
| `server.backups.afterContent` | Server backups, after content |
| `server.settings.beforeContent` | Server settings, before content |
| `server.settings.afterContent` | Server settings, after content |
| `server.startup.beforeContent` | Server startup, before content |
| `server.startup.afterContent` | Server startup, after content |
| `server.players.beforeContent` | Server players, before content |
| `server.players.afterContent` | Server players, after content |
| `server.worlds.beforeContent` | Server worlds, before content |
| `server.worlds.afterContent` | Server worlds, after content |
| `admin.addons.beforeContent` | Admin addons, before content |
| `admin.addons.afterContent` | Admin addons, after content |
| `admin.overview.beforeContent` | Admin overview, before content |
| `admin.overview.afterContent` | Admin overview, after content |
| `admin.servers.beforeContent` | Admin servers, before content |
| `admin.servers.afterContent` | Admin servers, after content |
| `admin.settings.beforeContent` | Admin settings, before content |
| `admin.settings.afterContent` | Admin settings, after content |
| `admin.users.beforeContent` | Admin users, before content |
| `admin.users.afterContent` | Admin users, after content |
| `auth.login.beforeContent` | Login page, before content |
| `auth.login.afterContent` | Login page, after content |
| `auth.register.beforeContent` | Register page, before content |
| `auth.register.afterContent` | Register page, after content |
| `layout.dashboard.wrapper` | Wraps entire dashboard layout |
| `layout.admin.wrapper` | Wraps entire admin layout |

## Commands

```typescript
commands.register({
  name: 'my-command',
  description: 'Does something useful',
  handler: async (args) => {
    return 'Command executed successfully';
  },
});
```

Commands are triggered from the admin addon detail page.

## Scheduled Tasks

```typescript
schedule.register({
  id: 'cleanup-task',
  intervalMs: 60 * 60 * 1000, // every hour
  handler: async () => {
    logger.info('Running cleanup...');
  },
});
```

Timers are automatically cleared on addon unload/reload.

## Static Assets

Place files in `public/`. They're served at `/addon-assets/<identifier>/`.

```html
<link rel="stylesheet" href="/addon-assets/my-addon/css/style.css">
<script src="/addon-assets/my-addon/js/main.js"></script>
```

## Dependencies

```json
"dependencies": [
  { "identifier": "other-addon", "range": ">=1.0.0" }
]
```

Addons are loaded in dependency order via topological sort. Missing or disabled dependencies prevent loading with a clear error.

## Version Compatibility

```json
"engines": { "panel": ">=1.0.0" }
```

Mismatches produce a warning by default. Set strict mode in admin settings to hard-block.

## Managing Addons

- `/admin/addons` — List, enable/disable, uninstall
- `/admin/addons/store` — Browse and install from community registry
- `/admin/addons/:slug` — Addon detail: settings, capabilities, commands

## Backward Compatibility

Addons built against the v1 contract (`(router, api) => void` with `name`, `version`, `main`, `router`, `enabled`, `migrations` in `package.json`) work without changes. New fields are all optional and backward-compatible.

## Reference Addon

See `storage/addons/reference-addon/` for a working example that exercises every v2 capability: manifest v2, lifecycle hooks, permissions, settings, slots, commands, scheduled tasks, migrations with rollback, and an API route.
