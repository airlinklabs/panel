# Addon UI Slots Reference

This document enumerates all available UI slots that addons can inject content into.

## Dashboard Slots

| Slot ID | Description |
|---------|-------------|
| `dashboard.home.beforeContent` | Before the main dashboard content area |
| `dashboard.home.afterContent` | After the main dashboard content area |
| `dashboard.home.sidebar` | In the dashboard sidebar area |

## Server Page Slots

| Slot ID | Description |
|---------|-------------|
| `server.console.beforeContent` | Before the server console content |
| `server.console.afterContent` | After the server console content |
| `server.console.commandRow` | At the console command input row |
| `server.files.beforeContent` | Before the server files content |
| `server.files.afterContent` | After the server files content |
| `server.backups.beforeContent` | Before the server backups content |
| `server.backups.afterContent` | After the server backups content |
| `server.settings.beforeContent` | Before the server settings content |
| `server.settings.afterContent` | After the server settings content |
| `server.startup.beforeContent` | Before the server startup content |
| `server.startup.afterContent` | After the server startup content |
| `server.players.beforeContent` | Before the server players content |
| `server.players.afterContent` | After the server players content |
| `server.worlds.beforeContent` | Before the server worlds content |
| `server.worlds.afterContent` | After the server worlds content |

## Admin Page Slots

| Slot ID | Description |
|---------|-------------|
| `admin.addons.beforeContent` | Before the admin addons content |
| `admin.addons.afterContent` | After the admin addons content |
| `admin.overview.beforeContent` | Before the admin overview content |
| `admin.overview.afterContent` | After the admin overview content |
| `admin.servers.beforeContent` | Before the admin servers content |
| `admin.servers.afterContent` | After the admin servers content |
| `admin.settings.beforeContent` | Before the admin settings content |
| `admin.settings.afterContent` | After the admin settings content |
| `admin.users.beforeContent` | Before the admin users content |
| `admin.users.afterContent` | After the admin users content |

## Auth Page Slots

| Slot ID | Description |
|---------|-------------|
| `auth.login.beforeContent` | Before the login form |
| `auth.login.afterContent` | After the login form |
| `auth.register.beforeContent` | Before the registration form |
| `auth.register.afterContent` | After the registration form |

## Layout Wrapper Slots

| Slot ID | Description |
|---------|-------------|
| `layout.dashboard.wrapper` | Wraps the entire dashboard layout (singular per addon, admin-revocable) |
| `layout.admin.wrapper` | Wraps the entire admin layout (singular per addon, admin-revocable) |

## Usage

```typescript
// Register a content slot
ui.registerSlot('dashboard.home.afterContent', (locals) => {
  return '<div class="my-content">Hello from my addon!</div>';
});

// Register a layout wrapper (singular per addon)
ui.registerDashboardWrapper((locals) => {
  return '<div id="my-global-banner">Global banner</div>';
});

// Unregister
ui.unregisterSlot('dashboard.home.afterContent');
ui.unregisterDashboardWrapper();
```

Layout wrappers are gated by the admin-revocable capability toggle. An admin can disable a wrapper without disabling the entire addon.
