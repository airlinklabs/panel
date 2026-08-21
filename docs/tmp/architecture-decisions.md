# Architecture Decisions — EJS + HTMX + Alpine Migration

Date: 2026-08-19

---

## 1. Directory Model

### Convention

```
views/
  admin/           # Full-page admin views (unchanged)
  api/             # API documentation pages (unchanged)
  auth/            # Auth pages (unchanged)
  components/      # Reusable EJS primitives (unchanged)
    ui/            # Base UI primitives: buttons, alerts, badges, etc.
  errors/          # Error pages (unchanged)
  fragments/       # NEW: HTMX fragment views (replaceable regions)
    admin/
      users/       # fragments/admin/users/user-list.ejs
      servers/     # fragments/admin/servers/server-list.ejs
    user/
      server/      # fragments/user/server/database-list.ejs
  user/            # Full-page user views (unchanged)
```

### Rules

- `views/fragments/` is the sole root for HTMX fragment responses.
- `views/components/` remains for reusable EJS includes (`include('../components/ui/alert')`).
- No second template root. Addons resolve through the existing `renderResolver.ts` and may render fragments from `storage/addons/<slug>/views/fragments/`.
- Fragment path mirrors the owning route: `views/fragments/<domain>/<feature>/<region>.ejs`.
- Example: `views/fragments/admin/users/user-list.ejs` handles `GET /admin/users` when `HX-Request: true`.

### File Naming

- Region name describes the DOM it replaces: `user-list`, `database-list`, `backup-card`, `settings-form`.
- One fragment file per swappable region. A page with 3 swappable regions gets 3 fragment files.
- Component includes used by fragments live in `views/components/` and are referenced by relative path.

---

## 2. Route Model

### Pattern: Page-Handler Helper

Every route that supports both full-page and HTMX fragment responses uses a single handler with a shared view-model function.

```ts
// src/modules/admin/users.ts

import type { Request, Response, NextFunction } from 'express';

interface UsersPageViewModel {
  user: User;
  settings: Settings;
  users: UserWithServers[];
  onlineUsers: Map<number, WebSocket>;
}

async function buildUsersViewModel(actorId: number): Promise<UsersPageViewModel> {
  // Authorization, data fetching, validation — ALL in one place.
  const user = await prisma.users.findUnique({ where: { id: actorId } });
  if (!user) throw new Error('User not found');

  const users = await prisma.users.findMany({ include: { servers: true } });
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  return { user, settings, users, onlineUsers };
}

router.get(
  '/admin/users',
  isAuthenticated(true, 'airlink.admin.users.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const vm = await buildUsersViewModel(req.session!.user!.id);

      // HTMX fragment response
      res.vary('HX-Request');
      if (req.get('HX-Request') === 'true') {
        return res.render('fragments/admin/users/user-list', vm);
      }

      // Full page response
      return res.render('admin/users/users', { ...vm, req });
    } catch (error) {
      return next(error);
    }
  },
);
```

### Rules

- One `build*ViewModel()` per page. It returns all data needed by both full page and fragment.
- `res.vary('HX-Request')` is called whenever a route has different full-page and fragment representations.
- Authorization and validation happen before the view-model call. `HX-Request` is never authorization.
- Full pages pass `req` to the view model (needed for translations, path, etc.). Fragments do not.
- Mutation routes (POST/PUT/DELETE) are separate handlers. They never render a full page for HTMX requests.
- Redirect-after-POST is used only for non-HTMX full form submissions. HTMX mutations return the changed fragment.

---

## 3. Fragment Response Contract

### Stable IDs

Every fragment root element has a stable, semantic ID that is the `hx-target` value:

```ejs
<!-- views/fragments/admin/users/user-list.ejs -->
<section id="admin-users-list" aria-labelledby="admin-users-heading">
  <h2 id="admin-users-heading" class="al-page-title sr-only">Users</h2>
  <% for (const u of users) { %>
    <%- include('../../../components/admin/user-row', { user: u }) %>
  <% } %>
</section>
```

### ID Convention

- Pattern: `<domain>-<feature>-<region>` — e.g. `admin-users-list`, `server-databases-list`, `server-backups-create-form`.
- IDs must be unique across the entire page. A fragment ID used in multiple rows (e.g. per-row IDs) uses a suffix: `admin-user-row-<id>`.
- Never include the same ID twice in a fragment response or nested fragment.

### Swap Mode

- **Default:** `hx-swap="outerHTML"`. The fragment response contains the full region root with the stable ID.
- **Exception:** `hx-swap="innerHTML"` only when the response is child markup of an existing stable container. Document why.
- **Never use:** `hx-swap="none"`, `hx-swap="delete"`, or `hx-swap="beforeend"` without a documented reason.

### Fragment Exclusions

A fragment must NOT contain:

- `<!doctype>`, `<html>`, `<head>`, `<body>`
- `header.ejs`, `footer.ejs`, `template.ejs`, `sidebar.ejs`
- Global toast, global modal, or global search markup
- Any ID that already exists elsewhere on the page

### Validation Error Fragments

When a mutation fails validation (422), return the form fragment with inline error messages:

```ejs
<!-- views/fragments/admin/users/user-create-form.ejs -->
<form id="admin-user-create-form" hx-post="/admin/users/create-user" ...>
  <div>
    <label for="email" class="al-label">Email</label>
    <input id="email" name="email" class="al-input <%= errors?.email ? 'border-red-500' : '' %>"
           value="<%= form.email %>" aria-invalid="<%= errors?.email ? 'true' : 'false' %>"
           aria-describedby="<%= errors?.email ? 'email-error' : undefined %>">
    <% if (errors?.email) { %>
      <p id="email-error" class="text-xs text-red-500 mt-1" role="alert"><%= errors.email %></p>
    <% } %>
  </div>
</form>
```

The `errors` and `form` objects come from the view model. The server re-renders the form fragment with preserved input and field-level errors.

---

## 4. Mutation Contract

### Request Flow

1. HTMX sends `hx-post`/`hx-put`/`hx-delete` with `HX-Request: true` and CSRF token.
2. Server validates with existing Zod schemas, authorizes with existing middleware.
3. On success: mutate, return canonical fragment + `HX-Trigger` toast event.
4. On failure: return error fragment with appropriate 4xx status.

### Success Response

```ts
// POST /admin/users/create-user
// ...
res.setHeader('HX-Trigger', JSON.stringify({
  al: { toast: { type: 'success', message: 'User created' } },
}));
return res.status(200).render('fragments/admin/users/user-list', vm);
```

### Error Responses

| Status | Meaning | Response |
|--------|---------|----------|
| 401 | Session expired / unauthenticated | `HX-Redirect: /login` header (or `HX-Trigger` with redirect event) |
| 403 | Authorized but forbidden for this resource | Error fragment: `role="alert"`, `aria-live="assertive"`, safe message from `safeClientMessage()` |
| 404 | Resource not found | Error fragment or empty state |
| 409 | Conflict (e.g. duplicate email) | Error fragment with inline field error |
| 422 | Validation failure | Re-render form fragment with `errors` object and `aria-invalid` |
| 500 | Unexpected server error | Error fragment with generic message; raw error logged server-side only |

### Error Fragment Pattern

```ejs
<!-- views/fragments/shared/error-banner.ejs -->
<div id="<%= targetId %>-error" class="al-alert al-alert-danger" role="alert" aria-live="assertive">
  <p class="text-sm"><%= message %></p>
  <% if (hint) { %>
    <p class="text-xs mt-1" style="color:var(--theme-text-muted)"><%= hint %></p>
  <% } %>
</div>
```

### CSRF

- CSRF token sent via `hx-headers` from `<meta name="csrf-token">` (existing `csrf.js` patch handles this).
- Never disable CSRF for fragment routes.
- On CSRF failure: return 403 with `HX-Redirect: /login`.

### Redirect After POST

- Full-page (non-HTMX) form submissions: `res.redirect(303, '/admin/users')`.
- HTMX form submissions: return the changed region fragment, never redirect.

---

## 5. Data Contract

### Shared View-Model Functions

Full pages and fragments call the same typed service/view-model functions:

```ts
// src/modules/admin/users.ts

// This function serves both full page and fragment responses.
// It returns ALL data needed by either representation.
async function buildUsersViewModel(actorId: number) {
  // shared data preparation
}

// Fragment endpoint
router.get('/admin/users', ..., async (req, res) => {
  const vm = await buildUsersViewModel(req.session!.user!.id);
  res.vary('HX-Request');
  if (req.get('HX-Request') === 'true') {
    return res.render('fragments/admin/users/user-list', vm);
  }
  return res.render('admin/users/users', { ...vm, req });
});
```

### JSON APIs Stay JSON

- `/api/*` endpoints return JSON. They are not repurposed as HTML fragment endpoints.
- HTML fragments live alongside their owning feature route (e.g. `GET /admin/users` returns HTML for both full and fragment).
- JSON-only mutation routes (POST/DELETE returning `{ success, ... }`) stay as JSON. HTMX can consume them with `hx-ext="json-enc"` or the route can be converted to return HTML fragments incrementally.

### Addon Contract

- Addons render through `renderResolver.ts`. A fragment request for `fragments/addon-x/my-feature/region` resolves through the same resolver.
- Addons may adopt HTMX conventions but are not required to. Core HTMX patterns are documented as optional extension contracts.
- Addon fragments must not include core panel shell elements.

---

## 6. State Boundary

### HTMX Owns Remote State

| HTMX manages | Pattern |
|---|---|
| CRUD data lists | Server renders fragment; HTMX swaps region |
| Filtered/paginated lists | `hx-trigger="change delay:300ms"` on inputs; server renders filtered fragment |
| Form submissions | `hx-post`; server validates, returns fragment |
| Tab content | `hx-get` on tab trigger; server renders tab fragment |
| Confirmation + action | `hx-confirm` or explicit dialog; `hx-delete` on confirm |

### Alpine Owns Local State

| Alpine manages | Pattern |
|---|---|
| Dialog open/closed | `x-data="{ open: false }"` on dialog root |
| Dropdown menu state | `x-data="{ open: false }"` on menu wrapper |
| Selected tab (ephemeral) | `x-data="{ tab: 'general' }"` on tab bar (for client-side tab switching only) |
| Temporary input affordance | `x-data="{ showAdvanced: false }"` toggle |
| Form dirty state | `x-data="{ dirty: false }"` with `@input="dirty = true"` |

### Alpine Does NOT Own

| Forbidden | Reason |
|---|---|
| Server data caches | Server is canonical; HTMX provides fresh fragments |
| User records, server lists | Server renders these; Alpine does not cache them |
| Permissions or roles | Server decides; Alpine cannot override |
| Long-lived network state | WebSockets are owned by specialist islands |
| `x-for` over server lists | Server renders the list HTML; Alpine does not reconstruct it |

### Islands Own Specialist Integrations

| Island | Root | Lifecycle |
|---|---|---|
| xterm (console) | `[data-island="console"]` | `mount(root, ctx)` / `destroy()` |
| Monaco editor | `[data-island="monaco"]` | `mount(root, ctx)` / `destroy()` |
| Chart.js | `[data-island="chart"]` | `mount(root, ctx)` / `destroy()` |
| File upload with progress | `[data-island="upload"]` | `mount(root, ctx)` / `destroy()` |
| Drag-and-drop | `[data-island="dnd"]` | `mount(root, ctx)` / `destroy()` |

---

## 7. Response Headers

### Required Headers

| Header | Value | When |
|---|---|---|
| `Vary` | `HX-Request` | Every route that renders differently for HTMX vs non-HTMX |
| `HX-Trigger` | JSON event payload | After every successful mutation (toast, state invalidation) |
| `HX-Redirect` | URL string | After non-HTMX form POST (redirect-after-POST pattern) |
| `HX-Location` | URL string | Only when HTMX must make a follow-up client request; document why a direct fragment response cannot work |

### HX-Trigger Event Format

```json
{
  "al:toast": {
    "type": "success",
    "message": "User created"
  }
}
```

Toast types: `success`, `error`, `warning`, `info`, `loading`.
Loading toasts are dismissed by a follow-up event with the same correlation ID.

### Cache-Control

- Full pages: existing behavior (session-dependent).
- Fragment responses: `Cache-Control: private, no-store` when content depends on session or user-specific data.
- Static fragments (e.g. settings page with no user data): may use `Cache-Control: private, max-age=0`.

### Do NOT Use

- `HX-Retarget` / `HX-Reswap` as substitutes for stable fragment IDs. These are exceptional recovery tools only.
- `HX-Push-URL` on mutations. Use it only for filter/pagination/tab state that should be bookmarkable.

---

## 8. Error and Observability Contract

### Error Sanitization

Reuse `safeClientMessage()` and `daemonMessage()` from `src/utils/errors.ts`:

```ts
import { safeClientMessage, daemonMessage } from '../../../utils/errors';

// For daemon errors (trusted structured fields):
return res.status(502).json({ error: daemonMessage(error, 'Failed to connect to node.') });

// For panel-local exceptions (never expose internals):
return res.status(500).json({ error: safeClientMessage(error, 'Failed to create user.') });
```

### Error Logging

- Log at the route handler level with route/fragment identifiers.
- Never log raw request body (may contain passwords).
- Never log raw daemon response body to client-facing logs.
- Use `logger.error()` with structured context: `{ route, fragment, error: rawErrorMessage(error) }`.

### Request IDs

- Every request already carries `X-Request-Id` from `src/app.ts` middleware.
- Fragment routes propagate the same request ID to the client via response header.
- The request ID is included in error logs for correlation.

### Observability Pattern

```ts
// In a route handler:
try {
  const vm = await buildViewModel(actorId);
  res.vary('HX-Request');
  if (req.get('HX-Request') === 'true') {
    return res.render('fragments/feature/region', vm);
  }
  return res.render('feature/page', { ...vm, req });
} catch (error) {
  logger.error('[admin/users] Failed to load users list', {
    route: '/admin/users',
    fragment: 'fragments/admin/users/user-list',
    requestId: req.headers['x-request-id'],
    error: rawErrorMessage(error),
  });
  return next(error);
}
```

### Fragment-Render Failures

If `res.render()` for a fragment throws, the error middleware catches it. The `errorPageHandler` renders a full error page. For HTMX requests, this means the fragment swap will contain the error page HTML — this is acceptable and safe because:
- The error page is a valid HTML document fragment.
- It does not include the document shell (header/footer/sidebar are in the error page itself).
- The user sees a meaningful error instead of a blank region.

---

## Summary: Pre-Change Checklist for Any Fragment Implementation

Before implementing a new fragment route, the agent must answer:

1. Which router owns it? Which permission middleware? Which view-model function?
2. Is the data server-rendered (EJS), local Alpine state, or a specialist island?
3. What is the stable fragment root ID? Does it collide with any existing ID on the page?
4. What happens on: success, validation failure, auth failure, daemon failure, empty data, slow request, navigation away?
5. How are CSRF, CSP nonce, escaping, theme tokens, focus, and keyboard preserved?
6. Which existing implementation becomes obsolete? What evidence permits deletion?
7. Which tests and visual checks prove it is safe?

---

## Reusable Fragment Checklist (Phase 04 Proven Pattern)

Copy this checklist for every new fragment implementation. Do not invent variants.

### Response Headers

- [ ] `Vary: HX-Request` set on the route
- [ ] `HX-Trigger` JSON event sent after successful mutation
- [ ] `Cache-Control: private, no-store` for user-specific fragments

### DOM Structure

- [ ] Fragment root has stable semantic ID: `<domain>-<feature>-<region>`
- [ ] No `<!doctype>`, `<html>`, `<head>`, `<body>` tags
- [ ] No `header.ejs`, `footer.ejs`, `template.ejs`, `sidebar.ejs` includes
- [ ] No global toast, modal, or search markup
- [ ] No duplicate IDs within the fragment

### Loading State

- [ ] `hx-disabled-elt="find button[type='submit']"` on forms
- [ ] `hx-indicator="#<id>-status"` with `<p id="<id>-status" class="htmx-indicator">Saving…</p>`
- [ ] Submit button shows loading text/icon while request is active

### Error Handling

- [ ] Validation failure (422): re-render form fragment with `errors` object, `aria-invalid`, `aria-describedby`
- [ ] Auth failure (401): `HX-Redirect: /login` or error fragment
- [ ] Not found (404): error fragment with safe message
- [ ] Conflict (409): error fragment explaining the conflict
- [ ] Server error (500): error fragment with generic message; raw error logged server-side only
- [ ] Error fragments use `role="alert"` and `aria-live="assertive"`

### Accessibility

- [ ] Labels associated with inputs via `for`/`id`
- [ ] Error messages linked via `aria-describedby`
- [ ] Invalid inputs marked with `aria-invalid="true"`
- [ ] Live status region for result feedback
- [ ] Focus preserved or restored after swap

### Mutation Pattern

- [ ] `hx-post`/`hx-put`/`hx-delete` with explicit `hx-target` and `hx-swap`
- [ ] CSRF token injected via `htmx:configRequest` (handled by htmx-bootstrap.js)
- [ ] Destructive actions use `hx-confirm` or explicit dialog confirmation
- [ ] Success returns canonical updated fragment (not raw JSON)
- [ ] Form preserves user input on validation failure

### Tests

- [ ] Fragment response does not include document shell
- [ ] Fragment has stable root ID
- [ ] Error fragments have `role="alert"`
- [ ] Full page and fragment share the same view-model function
- [ ] Authorization works for both full page and fragment responses
