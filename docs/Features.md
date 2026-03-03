# Airlink Panel — Feature Guide

This is a reference for everything in the Airlink panel. It covers the admin side, the user side, the addon system, and the API.

---

## Installation

### Quick install
```bash
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

The installer is interactive. It walks you through database setup, admin account creation, and optional addon selection.

### Manual install
```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel
sudo chown -R www-data:www-data /var/www/panel
sudo chmod -R 755 /var/www/panel
mv example.env .env
npm install -g typescript
npm install --omit=dev
npm run build-ts
npm run migrate:dev
npm install pm2 -g
pm2 start dist/app.js --name "panel"
pm2 save && pm2 startup
```

## Admin Panel

All admin pages are under `/admin`. You must be logged in as an admin to access them.

### Overview

The overview page is the first thing you see after logging in as an admin. It shows online nodes, total nodes, total instances, and average instance density across all nodes.

If a newer version of the panel is available, a notice appears here with a link to download it.

### Nodes

Nodes are the machines that run game servers. Each node runs the Airlink daemon, which the panel communicates with.

To create a node, go to Admin > Nodes > Create Node. You need to provide a name, the node's IP address, and the daemon port (default: 8080).

After creating a node, use the Configure button to get the daemon configuration details. Install and start the daemon on the node machine using those details.

The node list shows each node's connection status, IP, port, and how many instances it is running.

### Servers

Servers are game server instances that run on nodes. Each server belongs to a user and runs inside a container on a node.

To create a server, go to Admin > Servers > Create Server. You pick a node, a user to own the server, an image (the server type), and resource limits: RAM, disk, and CPU.

The server list shows every server across all nodes with its owner, node, and status.

Clicking a server in the list takes you to its detail page where you can edit its configuration, change resource limits, or delete it.

### Users

The user list shows all registered accounts. Each row shows the username, email, and whether the account has admin privileges.

To create a user manually, go to Admin > Users > Create User and fill in the email, username, and password.

Clicking a user opens their profile where you can edit their username and email, change their password, toggle admin status, and see which servers they own.

### Images

Images define what kind of server can be created. Each image specifies a Docker image, startup command, and the environment variables that the server needs.

You can upload an image from a JSON file or create one manually. The image editor lets you define environment variables with default values, labels, and whether they are shown to users.

Images are shared across all nodes. Any server creation form will list all available images.

### API Keys

API keys let external tools interact with the panel programmatically. Go to Admin > API Keys to manage them.

When creating a key, you assign it a name, an optional description, and a set of permissions. Permissions are scoped by resource and action:

- Servers: read, create, update, delete
- Users: read, create, update, delete
- Nodes: read, create, update, delete
- Settings: read, update

The key is shown once after creation. Copy it immediately — it cannot be retrieved again.

### Addons

The addons page at `/admin/addons` lists all addons in the `storage/addons/` folder. Each entry shows whether the addon is enabled or disabled. Toggling the switch enables or disables the addon (a panel restart is required for the change to take effect).

The marketplace tab lists all community addons from the `airlinklabs/addons` registry. From here you can install addons with one click — the panel clones the repository, runs `npm install` and `npm run build`, and streams the output back to the browser.

### Settings

The settings page covers panel-wide configuration: the panel name, default language, and other options that affect the whole installation.

---

## User Panel

### Dashboard

The dashboard lists every server the user has access to. Each card shows the server name, status (online or offline), and resource usage.

Clicking a server card opens the server management interface.

### Server Management

Each server has its own set of pages accessible from the server sidebar.

**Console** — A live terminal connected to the server process. You can send commands and see output in real time. The top of the console shows CPU, RAM, and disk usage. Buttons for start, stop, and restart are here.

**File Manager** — Browse, upload, download, edit, rename, move, and delete files on the server. The editor opens in the browser for text-based files.

**Settings** — Shows the server's name, resource limits, and startup command. Users can edit the startup variables that the image exposes.

**Subusers** — Lets the server owner invite other users by email and give them access to the server. Each subuser can be given full access or specific permissions (console, files, settings, etc.).

### Account

The account page lets users change their username, email, and password. Two-factor authentication (2FA) can be enabled here using any TOTP app. Once enabled, 2FA is required at every login.

---

## Addon System

Addons extend the panel without modifying core files. They live in `storage/addons/` and are loaded when the panel starts.

### Structure
```
my-addon/
├── package.json
├── index.ts
├── views/
│   └── main.ejs
└── lib/
    └── helpers.ts
```

### package.json

The `package.json` at the root of the addon folder tells the panel how to load it.
```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "description": "What this addon does",
  "author": "your-name",
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

- `main` — the entry point file. Defaults to `index.ts`.
- `router` — the base URL path for all routes in this addon.
- `migrations` — SQL statements to run when the addon is first enabled. Each migration runs once and is tracked so it never runs again.

### Entry Point

The entry point exports a default function that receives an Express router and the addon API object.
```typescript
import { Router } from 'express';
import path from 'path';

export default function(router: Router, api: any) {
  const { logger, prisma } = api;

  router.get('/', async (req: any, res: any) => {
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      res.render(path.join(api.viewsPath, 'main.ejs'), {
        user: req.session?.user,
        req,
        settings,
        components: {
          header:   api.getComponentPath('views/components/header'),
          template: api.getComponentPath('views/components/template'),
          footer:   api.getComponentPath('views/components/footer')
        }
      });
    } catch (error) {
      logger.error('Error:', error);
      res.status(500).send('An error occurred');
    }
  });
}
```

### Addon API

The second argument passed to your default function gives you access to everything the panel exposes.

**Core**

- `logger.info / warn / error / debug` — write to the panel log
- `prisma` — the Prisma ORM client, connected to the panel's database
- `addonPath` — absolute path to your addon folder
- `viewsPath` — absolute path to your addon's `views/` folder
- `getComponentPath(path)` — returns the absolute path to a panel layout component

**User utilities**

- `utils.isUserAdmin(userId)` — returns true if the user is an admin
- `utils.checkServerAccess(userId, serverId)` — returns true if the user can access the server
- `utils.getServerById(serverId)` — returns a server object
- `utils.getServerByUUID(uuid)` — returns a server object by UUID
- `utils.getPrimaryPort(server)` — returns the primary port for a server

**UI registration**

- `ui.addSidebarItem(item)` — adds an entry to the sidebar navigation
- `ui.addServerMenuItem(item)` — adds an item to the per-server sidebar
- `ui.addServerSection(section)` — adds a section to the server page

**Adding a sidebar item:**
```typescript
api.ui.addSidebarItem({
  id:      'my-addon',
  name:    'My Addon',
  icon:    '<svg ...></svg>',
  link:    '/my-addon',
  section: 'main',
  order:   50
});
```

### Views

Views are EJS templates. Use the panel's layout components to keep the UI consistent.
```html
<%- include(components.header, { title: 'My Addon', user: user }) %>

<main class="h-screen m-auto">
  <div class="flex h-screen">
    <div class="w-60 h-full">
      <%- include(components.template) %>
    </div>
    <div class="flex-1 p-6 overflow-y-auto pt-16">
      <div class="px-8 mt-5">
        <h1 class="text-base font-medium text-white">My Addon</h1>
      </div>
    </div>
  </div>
</main>

<%- include(components.footer) %>
```

### Database migrations

Migrations are defined in `package.json` under the `migrations` array. Each entry needs a unique `name` and a `sql` string. They run in order when the addon is first enabled and never run again after that.

Prefix your table names with your addon slug to avoid collisions with other addons and panel tables.
```json
"migrations": [
  {
    "name": "my_addon_create_items",
    "sql": "CREATE TABLE IF NOT EXISTS MyAddonItems (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
  }
]
```

### Installing an addon manually
```bash
cd /var/www/panel/storage/addons/
git clone https://github.com/you/your-addon.git your-addon
cd your-addon
npm install
npm run build
systemctl restart airlink-panel
```

Then go to Admin > Addons and enable it.

---

## REST API

The panel exposes a REST API for external integrations. All requests need an `Authorization` header with a valid API key.
```
Authorization: Bearer your-api-key
```

Permissions are checked per request based on what the key was granted at creation. Attempting an action without the required permission returns a 403.

Available permission scopes: `airlink.api.servers.*`, `airlink.api.users.*`, `airlink.api.nodes.*`, `airlink.api.settings.*`.

All responses are JSON. Successful responses include the requested data. Errors return an object with an `error` field and an appropriate HTTP status code.

---

## Language Support

The panel ships with English and German. Language strings live in `storage/lang/`. The active language is set in the panel settings.

To add a new language, copy `storage/lang/en/lang.json`, translate the values, and place the file in a new subfolder named after the language code.
