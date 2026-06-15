# Airlink API Specsheet

> The definitive reference for how the panel talks to the daemon, how users talk to the panel, and how everything fits together -_-

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Panel Routes](#panel-routes)
  - [Core / System](#core--system)
  - [Authentication](#authentication)
  - [User Dashboard & Account](#user-dashboard--account)
  - [Server Management](#server-management)
  - [Folder System](#folder-system)
  - [SFTP](#sftp)
  - [Admin - Overview](#admin--overview)
  - [Admin - Servers](#admin--servers)
  - [Admin - Users](#admin--users)
  - [Admin - Settings](#admin--settings)
  - [Admin - Nodes](#admin--nodes)
  - [Admin - Images / Eggs](#admin--images--eggs)
  - [Admin - Addons](#admin--addons)
  - [Admin - API Keys](#admin--api-keys)
  - [Admin - Security](#admin--security)
  - [Admin - Analytics](#admin--analytics)
  - [Admin - Player Stats](#admin--player-stats)
  - [Admin - Radar](#admin--radar)
  - [Admin - Misc](#admin--misc)
  - [API v1](#api-v1)
  - [Alternative API (Legacy)](#alternative-api-legacy)
  - [WebSocket Endpoints](#websocket-endpoints)
- [Daemon Routes](#daemon-routes)
  - [Core / System](#daemon-core--system)
  - [Container Lifecycle](#container-lifecycle)
  - [Container Backups](#container-backups)
  - [Filesystem](#filesystem)
  - [SFTP](#daemon-sftp)
  - [Minecraft](#minecraft)
  - [Radar (Scanning)](#radar-scanning)
  - [WebSocket Endpoints](#daemon-websocket-endpoints)
- [Panel ↔ Daemon Communication](#panel--daemon-communication)
- [HMAC Protocol](#hmac-protocol)
- [Authentication Flow](#authentication-flow)

---

## Architecture Overview

```
┌──────────────┐      HTTP/HMAC       ┌──────────────┐      Docker API      ┌──────────────┐
│   Browser    │ ──────────────────▶  │ Panel (Bun)  │ ──────────────────▶  │ Daemon (Bun) │
│              │ ◀─── session/cookie  │  Port 3000   │ ◀─── JSON responses  │  Port 3002   │
└──────────────┘                      └──────────────┘                      └──────┬───────┘
                                                                                   │
                                                                             ┌─────▼──────┐
                                                                             │   Docker   │
                                                                             │ Containers │
                                                                             └────────────┘
```

- **Panel**: Express.js web app serving HTML (EJS templates) + JSON APIs. Stores data in SQLite via Prisma.
- **Daemon**: Bun HTTP server running on each node. Manages Docker containers, files, and SFTP. Authenticates via HMAC + Basic Auth.
- **Communication**: Panel signs each request with HMAC-SHA256. Daemon verifies the signature before executing.

---

## Panel Routes

### Legend

| Symbol | Meaning |
|--------|---------|
| 🔒 | Requires session login |
| 👑 | Requires admin session |
| 🔑 | Requires API key (Bearer token) |
| 📡 | WebSocket endpoint |
| `{*path}` | Wildcard path parameter |

---

### Core / System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/system/status` | None | System status - OS info, node statuses, server/user counts |
| `GET` | `/api/health` | None | Health check - returns `{ status: 'ok' }` |
| `POST` | `/api/system/test-node-connection` | None | Test daemon connection. Body: `{ address, port, key }` |
| `GET` | `/api/search` | 🔒 | Search servers, users (admin), nodes (admin) by query `?q=` |

---

### Authentication

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/login` | None | Render login page. Redirects to `/register` if no users exist | - |
| `GET` | `/register` | None | Render registration page | - |
| `POST` | `/login` | None | Authenticate. Rate limited: 10/min | `{ identifier, password }` |
| `POST` | `/register` | None | Create account. Rate limited: 10/min | `{ email, username, password }` |
| `POST` | `/logout` | 🔒 | Destroy session, redirect to `/` | - |
| `GET` | `/logout` | 🔒 | Alternative GET logout | - |

---

### User Dashboard & Account

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/` | 🔒 | Dashboard - server list, folders, node statuses, stats | - |
| `GET` | `/account` | 🔒 | Account page with login history | - |
| `GET` | `/credits` | 🔒 | Credits / about page | - |
| `GET` | `/check-username` | 🔒 | Check username availability. Query: `?username=` | - |
| `POST` | `/update-description` | 🔒 | Update profile description | `{ description }` |
| `POST` | `/update-username` | 🔒 | Update username | `{ newUsername }` |
| `POST` | `/change-password` | 🔒 | Change password | `{ currentPassword, newPassword }` |
| `POST` | `/validate-password` | 🔒 | Validate current password | `{ currentPassword }` |
| `POST` | `/change-email` | 🔒 | Change email | `{ email }` |
| `POST` | `/set-language` | 🔒 | Set language preference (cookie) | `{ language }` |
| `POST` | `/upload-avatar` | 🔒 | Upload avatar image | Multipart: `avatar` |
| `POST` | `/remove-avatar` | 🔒 | Remove avatar | - |

---

### Server Management

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/create-server` | 🔒 | Server creation form | - |
| `POST` | `/create-server` | 🔒 | Create a new server | `{ name, description, nodeId, imageId, dockerImage, Memory, Cpu, Storage }` |
| `DELETE` | `/user/server/:uuid` | 🔒 | Delete own server (if allowed) | - |
| `GET` | `/server/:id` | 🔒 | Server detail/manage page | - |
| `GET` | `/server/:id/status` | 🔒 | Server runtime status + install state | - |
| `POST` | `/server/:id/power/:poweraction` | 🔒 | Power action: `start`, `stop`, `restart`, `kill` | - |
| `POST` | `/server/:id/power/restart` | 🔒 | Restart server container | - |
| `POST` | `/server/:id/reinstall` | 🔒 | Reinstall server (destroy + re-install) | - |
| `POST` | `/server/:id/rename` | 🔒 | Rename file/folder | `{ path, newName }` |
| `POST` | `/server/:id/feature/eula` | 🔒 | Accept Minecraft EULA | - |

#### File Management

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/server/:id/files` | 🔒 | File manager. Query: `?path=` | - |
| `GET` | `/server/:id/files/edit/{*path}` | 🔒 | File editor page | - |
| `POST` | `/server/:id/files/{*path}` | 🔒 | Save file content | `{ content }` |
| `DELETE` | `/server/:id/files/rm/{*path}` | 🔒 | Delete file or directory | - |
| `GET` | `/server/:id/files/download/{*path}` | 🔒 | Download file | - |
| `POST` | `/server/:id/upload` | 🔒 | Upload file | Multipart: `file`, `path`, `fileName` |
| `POST` | `/server/:id/zip` | 🔒 | Zip files | `{ relativePath, zipname }` |
| `POST` | `/server/:id/unzip` | 🔒 | Unzip files | `{ relativePath, zipname }` |

#### Startup Configuration

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/server/:id/startup` | 🔒 | Startup configuration page | - |
| `POST` | `/server/:id/startup/command` | 🔒 | Update startup command | `{ startCommand }` |
| `POST` | `/server/:id/startup/docker-image` | 🔒 | Update Docker image variant | `{ dockerImage }` |
| `POST` | `/server/:id/startup/variables` | 🔒 | Update server variables | `{ variables }` or form data |

#### Server Settings

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/server/:id/settings` | 🔒 | Server settings page | - |
| `POST` | `/server/:id/settings` | 🔒 | Update server name/description | `{ name, description }` |

#### Backups

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/server/:id/backups` | 🔒 | Backups page | - |
| `POST` | `/server/:id/backups/create` | 🔒 | Create a backup | `{ name }` |
| `POST` | `/server/:id/backups/:backupId/restore` | 🔒 | Restore a backup | - |
| `GET` | `/server/:id/backups/:backupId/download` | 🔒 | Download backup | - |
| `DELETE` | `/server/:id/backups/:backupId` | 🔒 | Delete backup | - |

#### Players & Worlds (Minecraft)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/server/:id/players` | 🔒 | Player list page (Minecraft query) |
| `GET` | `/server/:id/worlds` | 🔒 | Minecraft worlds page |

---

### Folder System

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/api/folders` | 🔒 | List all folders with member server UUIDs | - |
| `POST` | `/api/folders` | 🔒 | Create folder | `{ name }` |
| `PATCH` | `/api/folders/:id` | 🔒 | Rename folder | `{ name }` |
| `DELETE` | `/api/folders/:id` | 🔒 | Delete folder (servers become un-foldered) | - |
| `POST` | `/api/folders/:id/servers` | 🔒 | Add server to folder | `{ serverUUID }` |
| `DELETE` | `/api/folders/servers/:serverUUID` | 🔒 | Remove server from folder | - |

---

### SFTP

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/server/:id/sftp/credentials` | 🔒 | Get existing SFTP credentials |
| `POST` | `/server/:id/sftp/credentials` | 🔒 | Generate new SFTP credentials |
| `DELETE` | `/server/:id/sftp/credentials` | 🔒 | Revoke SFTP credentials |

---

### Admin - Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/overview` | 👑 | Admin dashboard |
| `GET` | `/admin/check-update` | 👑 | Check for panel updates |
| `POST` | `/admin/perform-update` | 👑 | Execute panel update |

---

### Admin - Servers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/servers` | 👑 | Server list |
| `GET` | `/admin/servers/edit/:id` | 👑 | Server edit form |
| `POST` | `/admin/servers/edit/:id` | 👑 | Update server settings |
| `GET` | `/admin/servers/create` | 👑 | Server creation form |
| `POST` | `/admin/servers/create` | 👑 | Create server |
| `GET` | `/admin/server/delete/:id` | 👑 | Delete server |

---

### Admin - Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/users` | 👑 | User list |
| `GET` | `/admin/users/create` | 👑 | User creation form |
| `POST` | `/admin/users/create-user` | 👑 | Create user |
| `GET` | `/admin/users/view/:id/` | 👑 | View user |
| `GET` | `/admin/users/edit/:id/` | 👑 | Edit user form |
| `DELETE` | `/admin/users/delete/:id` | 👑 | Delete user |
| `POST` | `/admin/users/update/:id/` | 👑 | Update user |

---

### Admin - Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/settings` | 👑 | Settings page |
| `POST` | `/admin/settings` | 👑 | Update global settings |
| `POST` | `/admin/settings/general` | 👑 | Update general settings |
| `POST` | `/admin/settings/security` | 👑 | Update security settings |
| `POST` | `/admin/settings/server-policy` | 👑 | Update server creation policy |
| `GET` | `/admin/settings/example-theme` | 👑 | Download example theme CSS |
| `POST` | `/admin/settings/ban-ip` | 👑 | Ban an IP |
| `POST` | `/admin/settings/unban-ip` | 👑 | Unban an IP |
| `POST` | `/admin/settings/reset` | 👑 | Reset panel settings |

---

### Admin - Nodes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/nodes` | 👑 | Node list |
| `GET` | `/admin/nodes/list` | 👑 | Node list data (JSON) |
| `GET` | `/admin/nodes/create` | 👑 | Node creation form |
| `POST` | `/admin/nodes/create` | 👑 | Create node |
| `DELETE` | `/admin/node/:id` | 👑 | Delete node |
| `GET` | `/admin/node/:id` | 👑 | Node detail page |
| `GET` | `/admin/node/:id/configure` | 👑 | Node installation page |
| `PUT` | `/admin/node/:id/edit` | 👑 | Update node |
| `GET` | `/admin/node/:id/stats` | 👑 | Node statistics |

---

### Admin - Images / Eggs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/images` | 👑 | Image/egg list |
| `POST` | `/admin/images/upload` | 👑 | Upload image/egg JSON |
| `POST` | `/admin/images/create` | 👑 | Create image/egg manually |
| `GET` | `/admin/images/edit/:id` | 👑 | Edit image form |
| `POST` | `/admin/images/edit/:id` | 👑 | Update image/egg |
| `GET` | `/admin/images/export/:id` | 👑 | Export image/egg as JSON |
| `DELETE` | `/admin/images/delete/:id` | 👑 | Delete image/egg |
| `GET` | `/admin/images/store` | 👑 | Store catalog page |
| `GET` | `/admin/images/store/catalogue` | 👑 | Fetch catalogue data (JSON) |
| `POST` | `/admin/images/store/install` | 👑 | Install egg from store |
| `POST` | `/admin/images/store/refresh` | 👑 | Refresh store catalogue |

---

### Admin - Addons

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/addons` | 👑 | Addons management page |
| `GET` | `/admin/addons/list` | 👑 | List installed addons (JSON) |
| `POST` | `/admin/addons/toggle/:slug` | 👑 | Enable/disable addon |
| `POST` | `/admin/addons/reload` | 👑 | Reload all addons |
| `GET` | `/admin/addons/store` | 👑 | Addon store page |
| `GET` | `/admin/addons/store/list` | 👑 | Fetch store listings (JSON) |
| `GET` | `/admin/addons/store/discussions` | 👑 | Fetch store discussions (JSON) |
| `POST` | `/admin/addons/store/install` | 👑 | Install addon from store |
| `POST` | `/admin/addons/store/uninstall` | 👑 | Uninstall addon from store |

---

### Admin - API Keys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/api/docs` | 👑 | API documentation page |
| `GET` | `/admin/apikeys` | 👑 | API keys management page |
| `POST` | `/admin/apikeys/create` | 👑 | Create API key |
| `POST` | `/admin/apikeys/delete/:id` | 👑 | Delete API key |
| `POST` | `/admin/apikeys/toggle/:id` | 👑 | Enable/disable API key |
| `POST` | `/admin/apikeys/edit/:id` | 👑 | Edit API key details |

---

### Admin - Security

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/security` | 👑 | Security settings page |
| `POST` | `/admin/security/rate-limit` | 👑 | Configure rate limiting |
| `POST` | `/admin/security/ban-ip` | 👑 | Ban an IP |
| `POST` | `/admin/security/unban-ip` | 👑 | Unban an IP |

---

### Admin - Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/analytics` | 👑 | Analytics dashboard page |
| `GET` | `/api/admin/analytics/summary` | 👑 | Analytics summary data (JSON) |

---

### Admin - Player Stats

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/playerstats` | 👑 | Player statistics page |
| `GET` | `/api/admin/playerstats` | 👑 | Player stats data (JSON) |
| `POST` | `/api/admin/playerstats/collect` | 👑 | Trigger player stats collection |

---

### Admin - Radar

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/radar/scripts` | 👑 | Security radar scripts page |
| `GET` | `/admin/radar/virustotal-enabled` | 👑 | Check VirusTotal integration status |
| `POST` | `/admin/radar/virustotal` | 👑 | Configure VirusTotal settings |
| `POST` | `/admin/radar/scan/:serverId` | 👑 | Run security scan on server |
| `POST` | `/admin/radar/vtscan/:serverId` | 👑 | Run VirusTotal scan on server |

---

### Admin - Misc

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/menu` | 👑 | Admin menu management page |
| `GET` | `/admin/airlink-cloud` | 👑 | AirLink Cloud settings page |
| `POST` | `/admin/airlink-cloud` | 👑 | Update AirLink Cloud settings |

---

### API v1

All routes use `Authorization: Bearer <api_key>` header with scoped permissions.

| Method | Path | Permission | Description | Body |
|--------|------|------------|-------------|------|
| `GET` | `/api/v1/ping` | None | Ping/health check | - |
| `GET` | `/api/v1` | None | API index (version, endpoints) | - |
| `GET` | `/api/v1/users` | `airlink.api.users.read` | List users | - |
| `GET` | `/api/v1/users/:id` | `airlink.api.users.read` | Get user by ID | - |
| `POST` | `/api/v1/users` | `airlink.api.users.create` | Create user | `{ email, username, password, isAdmin?, description? }` |
| `PATCH` | `/api/v1/users/:id` | `airlink.api.users.update` | Update user | `{ email?, username?, password?, isAdmin?, description? }` |
| `DELETE` | `/api/v1/users/:id` | `airlink.api.users.delete` | Delete user | - |
| `GET` | `/api/v1/servers` | `airlink.api.servers.read` | List servers | - |
| `GET` | `/api/v1/servers/:id` | `airlink.api.servers.read` | Get server by ID | - |
| `POST` | `/api/v1/servers` | `airlink.api.servers.create` | Create server | `{ name, nodeId, imageId, ownerId, ... }` |
| `PATCH` | `/api/v1/servers/:id` | `airlink.api.servers.update` | Update server | Various fields |
| `POST` | `/api/v1/servers/:id/suspend` | `airlink.api.servers.update` | Suspend server | - |
| `POST` | `/api/v1/servers/:id/unsuspend` | `airlink.api.servers.update` | Unsuspend server | - |
| `DELETE` | `/api/v1/servers/:id` | `airlink.api.servers.delete` | Delete server | - |
| `GET` | `/api/v1/nodes` | `airlink.api.nodes.read` | List nodes | - |
| `GET` | `/api/v1/nodes/:id` | `airlink.api.nodes.read` | Get node by ID | - |
| `POST` | `/api/v1/nodes` | `airlink.api.nodes.create` | Create node | `{ name, address, port, ram, cpu, disk, key, sftpPort? }` |
| `PATCH` | `/api/v1/nodes/:id` | `airlink.api.nodes.update` | Update node | Various fields |
| `DELETE` | `/api/v1/nodes/:id` | `airlink.api.nodes.delete` | Delete node | - |
| `GET` | `/api/v1/settings` | `airlink.api.settings.read` | Get panel settings | - |
| `PATCH` | `/api/v1/settings` | `airlink.api.settings.update` | Update panel settings | `{ title?, description?, logo?, favicon?, theme?, language? }` |

---

### Alternative API (Legacy)

Older API using raw Bearer token validation. All routes require `Authorization: Bearer <api_key>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/application/users` | List users |
| `GET` | `/api/application/users/:user` | Get single user |
| `POST` | `/api/application/users` | Create user |
| `PATCH` | `/api/application/users/:id` | Update user |
| `GET` | `/api/application/nodes` | List nodes |
| `GET` | `/api/application/nodes/:id` | Get single node |
| `POST` | `/api/application/servers` | Create server |

---

### WebSocket Endpoints

| Protocol | Path | Auth | Description |
|----------|------|------|-------------|
| `WS` | `/console/:id` | 🔒 | Interactive console proxy (bidirectional) |
| `WS` | `/status/:id` | 🔒 | Read-only status stream proxy |
| `WS` | `/events/:id` | 🔒 | Read-only events stream proxy |
| `WS` | `/online-check` | 🔒 | Online presence heartbeat tracker |

---

## Daemon Routes

### Legend

All authenticated routes require:
1. **IP allowlist** - must be in `ALLOWED_IPS`
2. **Basic Auth** - `Authorization: Basic <base64(Airlink:<key>)>`
3. **HMAC-SHA256** - `X-Airlink-Timestamp`, `X-Airlink-Signature`, `X-Airlink-Nonce` headers

---

### Daemon Core / System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | HMAC | Daemon identity - version, status, remote URL |
| `GET` | `/stats` | HMAC | Total cumulative stats (bytes in/out) and uptime |
| `GET` | `/healthz` | None | Health check - returns `{ ok: true }`. **Localhost only** |

---

### Container Lifecycle

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `POST` | `/container/installer` | HMAC | Create container from script (legacy). Synchronous. | `{ id, script, container, entrypoint?, env? }` |
| `POST` | `/container/install` | HMAC | Async install - pulls image, downloads scripts. Returns immediately. | `{ id, image?, scripts?: [{ url, fileName, ALVKT? }], env? }` |
| `POST` | `/container/start` | HMAC | Start container with image, env, ports, resources, command | `{ id, image, ports?, env?, Memory?, Cpu?, StartCommand? }` |
| `POST` | `/container/stop` | HMAC | Gracefully stop container | `{ id, stopCmd? }` |
| `DELETE` | `/container/kill` | HMAC | Force-kill container (SIGKILL) | `{ id }` |
| `DELETE` | `/container` | HMAC | Delete container and its Docker volume | `{ id }` |
| `GET` | `/container/status` | HMAC | Container running state, status, timestamps | Query: `?id=<id>` |
| `GET` | `/container/stats` | HMAC | Live resource stats (CPU, memory, network) | Query: `?id=<id>` |
| `POST` | `/container/command` | HMAC | Send command to container stdin | `{ id, command? }` |
| `GET` | `/container/status/:id` | HMAC | Async install state (`installing`, `installed`, `failed`) | Path: `:id` |

---

### Container Backups

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `POST` | `/container/backup` | HMAC | Create `.tar.gz` backup of container volume | `{ id, name }` |
| `POST` | `/container/restore` | HMAC | Restore backup to container volume | `{ id, backupPath }` |
| `DELETE` | `/container/backup` | HMAC | Delete a backup file | `{ backupPath }` |
| `GET` | `/container/backup/download` | HMAC | Download backup as `application/gzip` | Query: `?backupPath=<path>` |
| `POST` | `/container/backup/upload` | HMAC | Upload backup `.tar.gz` to daemon | Query: `?id=<id>&backupUuid=<uuid>`. Body: raw binary |

---

### Filesystem

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/fs/list` | HMAC | List directory contents | Query: `?id=<id>&path=<dir>&filter=<glob>` |
| `GET` | `/fs/size` | HMAC | Recursive directory size | Query: `?id=<id>&path=<dir>` |
| `GET` | `/fs/info` | HMAC | Aggregate file/dir count and total size | Query: `?id=<id>` |
| `GET` | `/fs/file/content` | HMAC | Read file contents | Query: `?id=<id>&path=<file>` |
| `POST` | `/fs/file/content` | HMAC | Write file content (overwrite) | `{ id, path, content }` |
| `GET` | `/fs/download` | HMAC | Download file as attachment | Query: `?id=<id>&path=<file>` |
| `DELETE` | `/fs/rm` | HMAC | Remove file or directory | `{ id, path? }` |
| `POST` | `/fs/zip` | HMAC | Create zip archive | `{ id, path: string \| string[], zipname? }` |
| `POST` | `/fs/unzip` | HMAC | Extract zip archive | `{ id, path?, zipname? }` |
| `POST` | `/fs/rename` | HMAC | Rename/move file or directory | `{ id, path, newName? / newPath? }` |
| `POST` | `/fs/upload` | HMAC | Upload file (base64 or raw string) | `{ id, path?, fileName, fileContent }` |
| `POST` | `/fs/create-empty-file` | HMAC | Create zero-byte file | `{ id, path?, fileName }` |
| `POST` | `/fs/append-file` | HMAC | Append to file (supports chunked uploads) | `{ id, path?, fileName, fileContent, chunkIndex?, totalChunks? }` |

---

### Daemon SFTP

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `POST` | `/sftp/credentials` | HMAC | Generate temporary SFTP credentials | `{ id }` |
| `DELETE` | `/sftp/credentials` | HMAC | Revoke SFTP credentials | `{ id }` |
| `GET` | `/sftp/status` | HMAC | Count of active SFTP sessions | - |

---

### Minecraft

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `GET` | `/minecraft/players` | HMAC | Fetch Minecraft server player list via query protocol | Query: `?id=<id>&host=<host>&port=<port>` |

---

### Radar (Scanning)

| Method | Path | Auth | Description | Body |
|--------|------|------|-------------|------|
| `POST` | `/radar/scan` | HMAC | Scan container volume against radar patterns | `{ id, script: { name, patterns: [...] } }` |
| `POST` | `/radar/zip` | HMAC | Zip scanned/filtered files | `{ id, include?, exclude?, maxFileSizeMb? }` → binary zip |

---

### Daemon WebSocket Endpoints

WebSocket endpoints use in-band key auth (not HMAC). After upgrade, client has 10 seconds to send `{ event: "auth", args: [key] }`.

| Path | Description |
|------|-------------|
| `GET /container/:containerId` (WS) | Live container logs (stdout+stderr). Also accepts `CMD` events to send commands. |
| `GET /containerstatus/:containerId` (WS) | Polls container state + stats every 2s, pushes `state` and `stats` events. |
| `GET /containerevents/:containerId` (WS) | Container lifecycle events: pulling, creating, starting, stopping, killed, error, etc. |

---

## Panel ↔ Daemon Communication

The panel communicates with daemons over HTTP. Every request goes through this pipeline:

```
Panel                                    Daemon
  │                                        │
  │  1. Build request (method, path, body) │
  │  2. Generate timestamp + nonce         │
  │  3. Sign: HMAC-SHA256(key,             │
  │       "${ts}:${nonce}:${method}        │
  │        :${path}:${body}")              │
  │  4. Send with headers:                 │
  │     Authorization: Basic <base64>      │
  │     X-Airlink-Timestamp: <ts>          │
  │     X-Airlink-Signature: <hex>         │
  │     X-Airlink-Nonce: <nonce>           │
  │──────────────────────────────────────▶  │
  │                                        │  5. Verify IP allowlist
  │                                        │  6. Verify Basic Auth
  │                                        │  7. Verify HMAC signature
  │                                        │  8. Check nonce (no replays)
  │                                        │  9. Rate limit check
  │                                        │ 10. Execute handler
  │  ◀─────────────────────────────────────│ 11. Return JSON response
```

### Request Format

```http
POST /container/start HTTP/1.1
Host: node1.example.com:3002
Content-Type: application/json
Authorization: Basic QWlybGluazp5b3VyLXNlY3JldC1rZXk=
X-Airlink-Timestamp: 1718476800
X-Airlink-Signature: a1b2c3d4e5f6...
X-Airlink-Nonce: 8f14e45fceea167a5a36dedd4bea2543

{"id":"abc-123","image":"nginx:latest","StartCommand":"nginx -g 'daemon off;'"}
```

### Response Format

```json
{
  "status": "running",
  "running": true,
  "startedAt": "2025-01-15T10:30:00Z"
}
```

---

## HMAC Protocol

### Signing

The panel signs every request with HMAC-SHA256:

```
payload = "${timestamp}:${nonce}:${METHOD}:${path}:${body}"
signature = HMAC-SHA256(key, payload)
```

- `timestamp` - Unix epoch seconds (must be within 30s of daemon clock)
- `nonce` - 16-byte random hex string (prevents replay attacks)
- `METHOD` - Uppercase HTTP method
- `path` - Request path (e.g. `/container/start`)
- `body` - Raw request body string (empty string for GET)

### Verification

The daemon:

1. Checks that timestamp is within 30 seconds of current time
2. Verifies the HMAC signature matches
3. Checks that the nonce hasn't been used before (in-memory set, cleared every 60s)
4. Rejects if any check fails with `401 Unauthorized`

### Headers Required

| Header | Description |
|--------|-------------|
| `X-Airlink-Timestamp` | Unix epoch seconds |
| `X-Airlink-Signature` | HMAC-SHA256 hex digest |
| `X-Airlink-Nonce` | Random nonce (16 bytes hex) |

---

## Authentication Flow

### Panel (Session-Based)

```
Browser ──POST /login──▶ Panel
                         │  Verify credentials (bcrypt)
                         │  Create session in SQLite
                         │  Set session cookie
Browser ◀──302 /──────── Panel
```

### API v1 (Bearer Token)

```
Client ──GET /api/v1/servers──▶ Panel
         Authorization: Bearer <api_key>
                                │  Look up API key in database
                                │  Check permission scope
                                │  Rate limit check
Client ◀──200 { servers: [...] } Panel
```

### Daemon (HMAC + Basic Auth)

```
Panel ──POST /container/start──▶ Daemon
        Authorization: Basic <base64>
        X-Airlink-Timestamp: <ts>
        X-Airlink-Signature: <sig>
        X-Airlink-Nonce: <nonce>
                                 │  Verify IP → Basic Auth → HMAC
Panel ◀──200 { status: ... }──── Daemon
```
