# AirLink Panel Addon Quick Start Guide

This guide walks through building your first addon using the v2 addon system.

## Prerequisites

- AirLink Panel installed and running
- Basic knowledge of TypeScript
- Familiarity with Express.js

## Step 1: Create the Addon Directory

```bash
mkdir -p panel/storage/addons/my-first-addon/views
```

## Step 2: Create package.json

```json
{
  "name": "My First Addon",
  "identifier": "my-first-addon",
  "version": "1.0.0",
  "description": "My first AirLink Panel addon",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-first-addon",
  "engines": {
    "panel": ">=1.0.0"
  },
  "permissions": [
    "addon.my-first-addon.view"
  ],
  "settingsSchema": [
    {
      "key": "message",
      "type": "string",
      "label": "Welcome Message",
      "default": "Hello from My First Addon!",
      "description": "A welcome message shown on the page"
    }
  ],
  "migrations": [
    {
      "name": "create_notes_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyFirstAddonNotes (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "down": "DROP TABLE IF EXISTS MyFirstAddonNotes"
    }
  ]
}
```

## Step 3: Create the Entry Point

```typescript
import { Router } from 'express';
import path from 'path';

export default function (router: Router, api: any) {
  const { logger, prisma, config, ui, commands, permissions } = api;

  logger.info('My First Addon initialized');

  // Register permissions
  permissions.register('addon.my-first-addon.view');

  // Register a command
  commands.register({
    name: 'greet',
    description: 'Prints the welcome message',
    handler: async () => {
      return await config.get('message') || 'Hello!';
    },
  });

  // Register a slot — inject content into the dashboard
  ui.registerSlot('dashboard.home.afterContent', async () => {
    const message = await config.get('message') || 'Hello from My First Addon!';
    return `<div class="mx-8 mt-4 rounded-xl bg-neutral-900 p-4 border border-neutral-800">
      <p class="text-sm text-neutral-300">${message}</p>
    </div>`;
  });

  // Main page
  router.get('/', async (req: any, res: any) => {
    const user = req.session?.user;
    if (!user) return res.redirect('/login');

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const message = await config.get('message') || 'Hello from My First Addon!';

    let notes: any[] = [];
    try {
      notes = await prisma.$queryRaw`SELECT * FROM MyFirstAddonNotes ORDER BY createdAt DESC`;
    } catch { /* table might not exist yet */ }

    res.render(path.join(api.viewsPath, 'index.ejs'), {
      user, req, settings, message, notes,
      components: api.getComponents(),  // Get all components for default viewport
    });
  });

  // Add a note
  router.post('/add', async (req: any, res: any) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ success: false });

    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false });

    await prisma.$executeRaw`INSERT INTO MyFirstAddonNotes (content) VALUES (${content})`;
    res.redirect('/my-first-addon');
  });

  // Return lifecycle hooks
  return {
    onInstall: () => logger.info('My First Addon installed!'),
    onEnable: () => logger.info('My First Addon enabled!'),
    onDisable: () => logger.info('My First Addon disabled!'),
    onUninstall: async () => {
      await config.deleteAll();
      logger.info('My First Addon uninstalled, config cleaned up');
    },
  };
}
```

## Step 4: Create a View

Create `views/index.ejs`:

```html
<%- include(components.header, { title: 'My First Addon', user: user }) %>

<main class="h-screen m-auto">
  <div class="flex h-screen">
    <div class="w-60 h-full"><%- include(components.template) %></div>
    <div class="flex-1 p-6 overflow-y-auto pt-16">
      <div class="sm:flex sm:items-center px-8 pt-4">
        <div class="sm:flex-auto">
          <h1 class="text-base font-medium leading-6 text-white">My First Addon</h1>
          <p class="mt-1 tracking-tight text-sm text-neutral-500"><%= message %></p>
        </div>
      </div>
      <div class="px-8 mt-5">
        <div class="rounded-xl bg-neutral-900 p-6 border border-neutral-800">
          <h2 class="text-lg font-medium text-white mb-4">Add Note</h2>
          <form action="/my-first-addon/add" method="POST" class="mb-6">
            <input type="text" name="content" required
              class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm"
              placeholder="Write a note...">
            <button type="submit" class="mt-2 rounded-xl bg-white hover:bg-neutral-200 text-neutral-800 px-4 py-2 text-sm font-medium">Add</button>
          </form>
          <h2 class="text-lg font-medium text-white mb-4">Notes</h2>
          <% if (notes.length > 0) { %>
            <% notes.forEach(function(note) { %>
              <div class="bg-neutral-800 rounded-xl p-3 mb-2">
                <p class="text-sm text-white"><%= note.content %></p>
                <p class="text-xs text-neutral-500 mt-1"><%= new Date(note.createdAt).toLocaleString() %></p>
              </div>
            <% }); %>
          <% } else { %>
            <p class="text-sm text-neutral-500">No notes yet.</p>
          <% } %>
        </div>
      </div>
    </div>
  </div>
</main>

<%- include(components.footer) %>
```

## Step 5: Enable Your Addon

1. Restart the panel
2. Go to `/admin/addons`
3. Find "My First Addon" and click Enable
4. Visit `/my-first-addon`

## Next Steps

- Add more [UI slots](addons.md#ui-slots) to inject content into other pages
- Use [scheduled tasks](addons.md#scheduled-tasks) for periodic maintenance
- Register [commands](addons.md#commands) for admin-triggered actions
- See the [reference addon](../storage/addons/reference-addon) for a complete working example

## Important: Trust Model

**Addons are not sandboxed.** Only install addons from sources you trust. Addons have full database and system access.
