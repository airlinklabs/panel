# AirLink Panel Addon System

This document provides a comprehensive guide to the AirLink Panel addon system, including how to create, configure, and manage addons.

## Table of Contents

1. [Introduction](#introduction)
2. [Addon Structure](#addon-structure)
3. [Creating an Addon](#creating-an-addon)
4. [Package.json Configuration](#packagejson-configuration)
5. [Addon Entry Point](#addon-entry-point)
6. [The Addon API](#the-addon-api)
7. [Creating Views](#creating-views)
8. [Database Access](#database-access)
9. [Database Migrations](#database-migrations)
10. [UI Components](#ui-components)
11. [Managing Addons](#managing-addons)
12. [Best Practices](#best-practices)
13. [Troubleshooting](#troubleshooting)
14. [Example Addon](#example-addon)

## Introduction

Addons are a powerful way to extend the functionality of AirLink Panel. They can add new features, modify existing ones, and integrate with external services. Addons are loaded dynamically when the panel starts, and can be enabled or disabled through the admin interface.

## Addon Structure

A typical addon has the following structure:

```
my-addon/
├── package.json       # Addon metadata and configuration
├── index.ts           # Main entry point
├── views/             # EJS templates
│   └── my-view.ejs    # Example view
├── public/            # Static assets (optional)
│   ├── css/           # CSS files
│   ├── js/            # JavaScript files
│   └── img/           # Images
└── lib/               # Additional modules (optional)
    └── my-module.ts   # Example module
```

## Creating an Addon

To create a new addon:

1. Create a new directory in the `panel/storage/addons/` folder with your addon's slug (e.g., `my-addon`)
2. Create a `package.json` file with your addon's metadata
3. Create an entry point file (default: `index.ts`)
4. Create a `views` directory for your EJS templates
5. Implement your addon's functionality

## Package.json Configuration

The `package.json` file defines your addon's metadata and configuration. Here's a complete example:

```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "description": "A description of what my addon does",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-addon",
  "enabled": true,
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
    }
  ]
}
```

### Required Fields

- `name`: The display name of your addon
- `version`: The version of your addon (semver format)

### Optional Fields

- `description`: A brief description of your addon
- `author`: The name of the addon author
- `main`: The entry point file (default: `index.ts`)
- `router`: The base URL path for your addon (default: `/`)
- `enabled`: Whether the addon is enabled by default (default: `true`)
- `migrations`: An array of database migrations to apply when the addon is enabled

## Addon Entry Point

The entry point file (default: `index.ts`) is the main file of your addon. It should export a function that takes a router and an API object:

```typescript
import { Router } from 'express';
import path from 'path';

interface AddonAPI {
  // API interface (see below)
}

export default function(router: Router, api: AddonAPI) {
  const { logger, prisma } = api;

  logger.info('My Addon initialized');

  // Define routes
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

  // Define API routes
  router.get('/api/data', async (req, res) => {
    try {
      const data = await prisma.someModel.findMany();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching data:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch data' });
    }
  });
}
```

You can also use CommonJS module syntax:

```javascript
module.exports = function(router, api) {
  // Your addon code
};
```

## The Addon API

The `api` object provides access to various panel features and utilities:

```typescript
interface AddonAPI {
  // Core utilities
  registerRoute: (path: string, router: Router) => void;
  logger: {
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
    debug: (message: string, ...args: any[]) => void;
  };
  prisma: PrismaClient; // Prisma ORM client for database access

  // Path utilities
  addonPath: string;    // Path to the addon directory
  viewsPath: string;    // Path to the addon's views directory
  getComponentPath: (componentPath: string) => string; // Get path to a panel component

  // View utilities
  renderView: (viewName: string, data?: any) => string;

  // User and server utilities
  utils: {
    isUserAdmin: (userId: number) => Promise<boolean>;
    checkServerAccess: (userId: number, serverId: number) => Promise<boolean>;
    getServerById: (serverId: number) => Promise<any>;
    getServerByUUID: (uuid: string) => Promise<any>;
    getServerPorts: (server: any) => any[];
    getPrimaryPort: (server: any) => any;
  };

  // UI components
  ui: {
    // Sidebar
    addSidebarItem: (item: SidebarItem) => void;
    removeSidebarItem: (id: string) => void;
    getSidebarItems: (section?: string) => SidebarItem[];

    // Server menu
    addServerMenuItem: (item: ServerMenuItem) => void;
    removeServerMenuItem: (id: string) => void;
    getServerMenuItems: (feature?: string) => ServerMenuItem[];

    // Server sections
    addServerSection: (section: ServerSection) => void;
    removeServerSection: (id: string) => void;
    getServerSections: () => ServerSection[];
    addServerSectionItem: (sectionId: string, item: ServerSectionItem) => void;
    removeServerSectionItem: (sectionId: string, itemId: string) => void;
    getServerSectionItems: (sectionId: string) => ServerSectionItem[];
  };
}
```

### Using the Logger

The logger provides methods for logging messages at different levels:

```typescript
api.logger.info('This is an info message');
api.logger.warn('This is a warning message');
api.logger.error('This is an error message');
api.logger.debug('This is a debug message');
```

### Registering Routes

You can register additional routes using the `registerRoute` method:

```typescript
const apiRouter = Router();
apiRouter.get('/data', (req, res) => {
  res.json({ success: true, data: 'Hello from my addon API!' });
});

api.registerRoute('/my-addon/api', apiRouter);
```

## Creating Views

Views are created using EJS templates. Create a `views` directory in your addon folder and add your EJS templates there.

Example view (`views/my-view.ejs`):

```html
<%- include(components.header, { title: 'My Addon', user: user }) %>

<div class="container mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-2xl font-bold mb-4">My Addon</h1>
    <p class="text-gray-400">This is my awesome addon.</p>
  </div>

  <div class="bg-neutral-800 rounded-lg p-6 shadow-md">
    <h2 class="text-xl font-semibold mb-4">My Content</h2>
    <p>Hello, <%= user ? user.username : 'Guest' %>!</p>
  </div>
</div>

<%- include(components.footer) %>
```

To render a view:

```typescript
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
```

## Database Access

Addons have full access to the database through the Prisma ORM client:

```typescript
// Get all users
const users = await api.prisma.users.findMany();

// Get a specific user
const user = await api.prisma.users.findUnique({
  where: { id: 1 }
});

// Create a new record
await api.prisma.someModel.create({
  data: {
    name: 'New Record',
    value: 123
  }
});

// Update a record
await api.prisma.someModel.update({
  where: { id: 1 },
  data: { name: 'Updated Record' }
});

// Delete a record
await api.prisma.someModel.delete({
  where: { id: 1 }
});
```

For tables that aren't defined in the Prisma schema (like custom tables created by your addon), you can use raw SQL queries:

```typescript
// Execute a raw query
const results = await api.prisma.$queryRaw`SELECT * FROM MyCustomTable WHERE name = ${name}`;

// Execute a raw SQL statement
await api.prisma.$executeRaw`INSERT INTO MyCustomTable (name, value) VALUES (${name}, ${value})`;
```

## Database Migrations

Addons can define database migrations in the `package.json` file. These migrations are automatically applied when the addon is enabled.

```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "migrations": [
    {
      "name": "create_my_table",
      "sql": "CREATE TABLE IF NOT EXISTS MyTable (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    },
    {
      "name": "add_description_column",
      "sql": "ALTER TABLE MyTable ADD COLUMN description TEXT"
    }
  ]
}
```

Each migration must have:
- `name`: A unique name for the migration
- `sql`: The SQL statement to execute

Migrations are applied in the order they are defined. Once a migration has been applied, it will not be applied again, even if the addon is disabled and re-enabled.

### Migration Best Practices

1. Always use `IF NOT EXISTS` when creating tables to prevent errors if the table already exists
2. Use `ALTER TABLE` statements to modify existing tables
3. Keep migrations small and focused on a single change
4. Use descriptive names for your migrations
5. Test your migrations thoroughly before releasing your addon

For more information, see the [addon-migrations.md](addon-migrations.md) documentation.

## UI Components

Addons can add items to various UI components in the panel:

### Sidebar Items

```typescript
api.ui.addSidebarItem({
  id: 'my-addon-link',
  name: 'My Addon',
  icon: '<svg>...</svg>', // SVG icon
  link: '/my-addon',
  section: 'main', // 'main', 'system', or 'other'
  order: 100 // Lower numbers appear first
});
```

### Server Menu Items

```typescript
api.ui.addServerMenuItem({
  id: 'my-addon-server-link',
  name: 'My Feature',
  icon: '<svg>...</svg>', // SVG icon
  link: '/server/{id}/my-feature',
  feature: 'management' // 'management', 'settings', or 'advanced'
});
```

### Server Sections

```typescript
// Add a new section
api.ui.addServerSection({
  id: 'my-addon-section',
  name: 'My Section',
  icon: '<svg>...</svg>', // SVG icon
  order: 100 // Lower numbers appear first
});

// Add items to the section
api.ui.addServerSectionItem('my-addon-section', {
  id: 'my-addon-section-item',
  name: 'My Item',
  link: '/server/{id}/my-feature'
});
```

## Managing Addons

Addons can be managed through the admin interface at `/admin/addons`. From there, you can:

1. View all installed addons
2. Enable or disable addons
3. Reload addons (useful during development)

## Best Practices

1. **Namespace your database tables**: Prefix your table names with your addon name to avoid conflicts with other addons or the core panel.
2. **Handle errors gracefully**: Always catch exceptions and provide meaningful error messages.
3. **Clean up after yourself**: When your addon is disabled, clean up any resources it created.
4. **Follow the panel's design patterns**: Use the same UI components and styles as the core panel for a consistent user experience.
5. **Document your addon**: Provide clear documentation for users and other developers.
6. **Test thoroughly**: Test your addon in different environments and with different configurations.
7. **Keep it simple**: Focus on doing one thing well rather than trying to do everything.

## Troubleshooting

### Common Issues

1. **Addon not loading**: Check the server logs for errors. Make sure your `package.json` is valid JSON and your entry point file exists.
2. **Routes not working**: Check that your router is properly configured and that your routes are defined correctly.
3. **Database errors**: Check that your migrations are valid SQL and that your database queries are correct.
4. **UI components not appearing**: Check that you're using the correct IDs and that your components are properly registered.

### Debugging

Enable debug logging in the panel to see more detailed information about addon loading and execution:

```
DEBUG=true npm run start:dev
```

## Example Addon

Here's a complete example of a simple addon that adds a custom page and a database table:

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

  // Add sidebar item
  api.ui.addSidebarItem({
    id: 'user-notes',
    name: 'User Notes',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>',
    link: '/user-notes',
    section: 'main',
    order: 50
  });

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
  async function addUserNote(userId: number, note: string) {
    try {
      await prisma.$executeRaw`
        INSERT INTO UserNotes (userId, note) 
        VALUES (${userId}, ${note})
      `;
      return true;
    } catch (error) {
      logger.error('Error adding user note:', error);
      return false;
    }
  }

  // Main page
  router.get('/', async (req: any, res: any) => {
    try {
      if (!req.session?.user) {
        return res.redirect('/login');
      }

      const userId = req.session.user.id;
      const notes = await getUserNotes(userId);
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

      res.render(path.join(api.viewsPath, 'notes.ejs'), {
        user: req.session.user,
        req,
        settings,
        notes,
        components: {
          header: api.getComponentPath('views/components/header'),
          template: api.getComponentPath('views/components/template'),
          footer: api.getComponentPath('views/components/footer')
        }
      });
    } catch (error) {
      logger.error('Error rendering notes page:', error);
      res.status(500).send('An error occurred');
    }
  });

  // Add note
  router.post('/add', async (req: any, res: any) => {
    try {
      if (!req.session?.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const { note } = req.body;
      if (!note) {
        return res.status(400).json({ success: false, error: 'Note is required' });
      }

      const success = await addUserNote(req.session.user.id, note);
      if (success) {
        return res.redirect('/user-notes');
      } else {
        return res.status(500).json({ success: false, error: 'Failed to add note' });
      }
    } catch (error) {
      logger.error('Error adding note:', error);
      return res.status(500).json({ success: false, error: 'An error occurred' });
    }
  });

  // API to get notes
  router.get('/api/notes', async (req: any, res: any) => {
    try {
      if (!req.session?.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const notes = await getUserNotes(req.session.user.id);
      return res.json({ success: true, notes });
    } catch (error) {
      logger.error('Error fetching notes via API:', error);
      return res.status(500).json({ success: false, error: 'An error occurred' });
    }
  });
}
```

### views/notes.ejs

```html
<%- include(components.header, { title: 'User Notes', user: user }) %>

<main class="h-screen m-auto">
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-60 h-full">
      <%- include(components.template) %>
    </div>
    <!-- Content -->
    <div class="flex-1 p-6 overflow-y-auto pt-16">
      <div class="sm:flex sm:items-center px-8 pt-4">
        <div class="sm:flex-auto">
          <h1 class="text-base font-medium leading-6 text-white">User Notes</h1>
          <p class="mt-1 tracking-tight text-sm text-neutral-500">Keep track of your personal notes</p>
        </div>
      </div>
      <div class="px-8 mt-5">
        <div class="rounded-xl bg-neutral-900 p-6">
          <!-- Add Note Form -->
          <div class="mb-6">
            <h2 class="text-lg font-medium text-white mb-4">Add New Note</h2>
            <form action="/user-notes/add" method="POST">
              <div class="mb-4">
                <textarea name="note" rows="3" required
                  class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Write your note here..."></textarea>
              </div>
              <button type="submit"
                class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200">
                Save Note
              </button>
            </form>
          </div>

          <!-- Notes List -->
          <div>
            <h2 class="text-lg font-medium text-white mb-4">Your Notes</h2>
            <% if (notes && notes.length > 0) { %>
              <div class="space-y-4">
                <% notes.forEach(note => { %>
                  <div class="bg-neutral-800 p-4 rounded-lg">
                    <p class="text-neutral-300"><%= note.note %></p>
                    <p class="text-xs text-neutral-500 mt-2">
                      <%= new Date(note.createdAt).toLocaleString() %>
                    </p>
                  </div>
                <% }); %>
              </div>
            <% } else { %>
              <p class="text-neutral-500">You don't have any notes yet. Add your first note above!</p>
            <% } %>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>

<%- include(components.footer) %>
```

This example demonstrates:
1. Creating a database table with migrations
2. Adding a sidebar item
3. Creating routes for viewing and adding data
4. Rendering a view with EJS
5. Providing an API endpoint
6. Using the Prisma client for database operations
