# Modrinth Store — API Reference

## Base URL

All routes are mounted at `/modrinth` (configured in `package.json` `"router"` field).

## Authentication

All routes require session authentication. Unauthenticated requests are redirected to `/auth/login`.

## Page Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/modrinth` | Browse/search page (renders `browse.ejs`) |
| `GET` | `/modrinth/project/:id` | Project detail page (renders `project.ejs`) |
| `GET` | `/modrinth/installed/:serverId` | Installed mods for a server (renders `installed.ejs`) |
| `GET` | `/modrinth/admin/config` | Admin settings page (admin only, renders `admin.ejs`) |

## API Routes

### Search

```
GET /modrinth/api/search?q=string&type=string&index=string&offset=number&limit=number
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query (max 200 chars) |
| `type` | string | — | Filter by project type (mod, modpack, plugin, shader, resourcepack, datapack) |
| `index` | string | `relevance` | Sort order (relevance, downloads, follows, newest, updated) |
| `offset` | number | `0` | Pagination offset (>= 0) |
| `limit` | number | `20` | Results per page (1-50) |

**Response:** `ModrinthSearchResponse`

### Get Project

```
GET /modrinth/api/project/:id
```

**Response:** `{ project: ModrinthProject, versions: ModrinthVersion[], isBlocked: boolean }`

### Install

```
POST /modrinth/api/install
Content-Type: application/json
X-CSRF-Token: <token>

{
  "serverId": "uuid",
  "projectId": "string",
  "versionId": "string"
}
```

**Response:** `{ success: true, message: "Installation started" }`

**Errors:**
- `400` — Invalid input
- `401` — Not authenticated
- `403` — Not server owner or project blocked
- `404` — Server or project not found
- `409` — Installation already in progress

### Bulk Install

```
POST /modrinth/api/bulk-install
Content-Type: application/json
X-CSRF-Token: <token>

{
  "serverId": "uuid",
  "installs": [
    { "projectId": "string", "versionId": "string" }
  ]
}
```

**Response:** `{ success: true, results: [{ projectId, success, error? }] }`

### Uninstall

```
POST /modrinth/api/uninstall
Content-Type: application/json
X-CSRF-Token: <token>

{
  "serverId": "uuid",
  "projectId": "string",
  "projectName": "string",
  "projectType": "mod|modpack|plugin|shader|resourcepack|datapack"
}
```

**Response:** `{ success: true, message: "Mod uninstalled" }`

### Servers

```
GET /modrinth/api/servers
```

**Response:** `{ servers: [{ UUID, name, status, owner?, node? }] }`

### Progress

```
GET /modrinth/api/progress                    # All active installations
GET /modrinth/api/progress/:serverId/:projectId  # Single installation
DELETE /modrinth/api/progress/:serverId/:projectId  # Remove entry
```

**Response:** `InstallationProgress` or `InstallationProgress[]`

### Config

```
GET /modrinth/api/config           # Get settings (admin only)
POST /modrinth/api/config          # Update settings (admin only)
```

**POST Body:**
```json
{
  "showWarningBanner": true,
  "warningTitle": "Notice",
  "warningMessage": "...",
  "disabledProjectTypes": "shader,mod",
  "blockedProjects": "abc123,def456"
}
```

### Cache

```
POST /modrinth/api/cache/clear     # Clear API cache (admin only)
```

### Health

```
GET /modrinth/api/health
```

**Response:** `{ modrinth: "healthy"|"unreachable"|"error", timestamp: string }`

### Statistics

```
GET /modrinth/api/statistics       # (admin only)
```

**Response:** `{ byType: [{ projectType, count }], byStatus: [{ status, count }] }`

### Installations

```
GET /modrinth/api/installations/:serverId
```

**Response:** `InstallationRecord[]`

### Collections

```
GET /modrinth/api/collections              # Get user's collections
POST /modrinth/api/collections             # Create collection
DELETE /modrinth/api/collections/:id       # Delete collection
```

### Search History

```
GET /modrinth/api/search-history           # Get user's search history
POST /modrinth/api/search-history          # Save search query
```

## Types

### ModrinthSearchResult

```typescript
{
  slug: string;
  title: string;
  description: string;
  categories: string[];
  project_type: "mod" | "modpack" | "resourcepack" | "shader" | "datapack" | "plugin";
  downloads: number;
  icon_url: string | null;
  project_id: string;
  author: string;
  follows: number;
  // ... more fields
}
```

### ModrinthProject

```typescript
{
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: string[];
  project_type: "mod" | "modpack" | "resourcepack" | "shader" | "datapack" | "plugin";
  downloads: number;
  icon_url: string | null;
  source_url: string | null;
  issues_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
  versions: string[];
  follows: number;
  // ... more fields
}
```

### ModrinthVersion

```typescript
{
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  game_versions: string[];
  loaders: string[];
  files: [{
    hashes: Record<string, string>;
    url: string;
    filename: string;
    primary: boolean;
    size: number;
  }];
  dependencies: [{
    project_id: string;
    version_id: string | null;
    dependency_type: "required" | "optional" | "incompatible" | "embedded";
  }];
  // ... more fields
}
```

### InstallationProgress

```typescript
{
  serverId: string;
  projectId: string;
  projectName: string;
  stage: "initializing" | "downloading" | "processing" | "installing_mods" | "installing_overrides" | "finalizing" | "completed" | "failed";
  totalMods: number;
  completedMods: number;
  skippedMods: number;
  failedMods: number;
  currentMod: string;
  mods: ModProgress[];
  errors: string[];
  warnings: string[];
  startedAt: number;
  completedAt?: number;
}
```
