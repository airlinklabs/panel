# Intent · 03 · Blueprint

> System map of Airlink Panel — frontstage, backstage, support tier, trust boundaries, and failure modes.
> A self-contained HTML service blueprint is in `03-blueprint-visual.html` alongside this file.

---

## System overview

Airlink Panel is a control plane. It manages game servers that run inside containers on remote nodes. The panel itself is a browser-served Express app; each node runs a **daemon**; the daemon manages **Docker containers**, **files**, and **SFTP**; everything between panel and daemon is HMAC-signed.

Purpose: let one panel operator (or a server owner) inspect health, provision infrastructure, manage access, edit settings, and recover from failures without leaving the browser.

Who it serves: administrators (fleet-level operators) and server owners/subusers (single-server operators). Third party: addon developers and API integrators.

What prompted this analysis: the /strategize tension — the "predictable under pressure" thesis depends on the trust and data paths being reliable, and the deep-work surfaces being consistent.

---

## Service blueprint

```
Browser (frontstage)
  Admin        ── login, dashboard, /admin/* (nodes, servers, users, images,
                  addons, settings, analytics, API keys)
  Owner/Subuser ── login, dashboard, /server/* (console, files, backups,
                  schedules, databases, subusers, settings, players, worlds)
  Non-auth     ── login/register/2FA/password reset

   ─── Line of interaction ─── (HTTPS; the panel is the single frontstage surface)

Backstage (Express app)
  Middleware chain: trust-proxy → static → EJS (addon-aware render) → nonce →
    helmet/CSP(strict-dynamic) → IP-ban → rate-limit → session(Prisma store) →
    body parsers → translation → SPA → CSRF (skipped for /ws and /api/) → locals
  Module router: auth / core / user / admin / api (v1+client) → Prisma (SQLite/MySQL)
  Addon loader: modulesLoader import()s storage/addons/*, version-checked, mounts views+routes
  WS gateway: /console/:id, /status/:id, /events/:id, /online-check
  Job/ops services: rate-limit cache, security cache, S3 backup upload, mailer (SMTP)

   ─── Line of visibility ───

Support tier (per-node daemon + infrastructure)
  Daemon (node) ─ HMAC-signed RPC → panel ─ Docker (containers), file mgmt, SFTP
  External: Modrinth API (addon), Docker registries (images), S3-compatible storage,
  systemd (installer), Nginx/reverse proxy (deployment)
```

**Lanes at a glance:** Frontstage = one browser surface serving three roles. Backstage = a single Express process with a deliberately defensive middleware chain. Support = distributed daemons (one per node), each owning its local containers and files, reachable only through HMAC-signed RPC. The panel is the only frontstage; the daemons are the support tier's arms.

---

## Trust and data-flow map

### Flow 1 — Authenticated page render (hot path, every page)
```
Browser → session cookie (httpOnly, secure-on-HTTPS) → session store (Prisma)
  → isAuthenticated() → (admin? isAdminRequired) → view-locals (menu items)
  → module router → EJS render → HTML + nonce'd CSP
```
- Nonce + strict-dynamic CSP means every inline script needs a per-request nonce — safe, but it constrains addon UI that injects inline JS.
- Subuser permission model: `requireSubUserPermission` with ~50 permissions grouped into `PERMISSION_GROUPS`, wildcard matching (`server.*`, `admin.*`).

### Flow 2 — Console (real-time, highest-fidelity requirement)
```
Browser (xterm) → WS /console/:id → WS token auth + isAuthenticatedForServerWS
  → (subuser: console perm) → panel proxies → daemon WS (HMAC auth handshake
  {event:'auth', args:[node.key]}) → container stdin/stdout
Commands: browser → WS → panel → REST POST /container/command → daemon → container
```
- Binary frames preserved. Two read-only proxies (`/status`, `/events`) use the same auth path.
- **Trust boundary:** the panel never exposes daemon keys to the browser; the WS token is a short-lived capability scoped to a server+user.

### Flow 3 — Provisioning a node + first server (adoption-critical)
```
Admin: create node (name/IP/port) → get daemon config (out-of-band copy) →
  run daemon on node machine → panel↔daemon handshake (HMAC) → node online
Admin: create server (node, user, image, limits, ports/allocations) → daemon
  pulls image, creates container → server appears in owner's dashboard
```
- **Two handoffs are manual and out-of-band:** copying daemon config to the node machine, and installing the daemon itself. This is the biggest structural adoption risk (see failure modes).

### Flow 4 — Addon runtime
```
Addon (storage/addons/<slug>) → package.json (router, migrations, enabled)
  → modulesLoader import()s on boot → mounts router + views (addon-aware EJS fallback)
  → addon API: prisma, security (sanitize/url-validate), config, ui (sidebar/server
  menu/sections), renderView, logger, schedule, assetsUrl
```
- Addons get DB access, background scheduling, and UI-registration hooks. They can also render their **own views** — which is where the shared component vocabulary can diverge.

---

## Ecosystem & dependencies

| Actor | Role | Dependencies on |
|---|---|---|
| Admin | Fleet operator | Everything below |
| Server owner | Single-server operator | Panel availability |
| Subuser | Scoped access to one server | Owner's grants, permission groups |
| Panel (Express) | Control plane | DB, daemons, mailer, storage, addons |
| Daemon (per node) | Node-side executor | Docker, node disk, panel |
| Addon | Extends panel | Panel API contract, DB, its own deps |
| API integrator | Programmatic control | API keys, scoped perms |
| External services | Images, mods, backups, mail | Internet connectivity |

### Structural dependencies
- **Panel ↔ DB:** session store + all settings/data. SQLite by default; MySQL supported. Single point of failure for the whole panel.
- **Panel ↔ Daemon:** every real-time and every container action crosses this. If the daemon is unreachable, the console, files, power controls, and backups all degrade (they do degrade — with inline "daemon offline" banners and retry buttons, per the views audit).
- **Addon ↔ Panel contract:** addon boot is version-checked; a breaking panel version refuses incompatible addons. Good governance. But addon *views* are unconstrained once loaded.

### Risk areas
1. **The panel↔daemon handshake is the most brittle structural seam.** Setup is manual and out-of-band; failures surface as "connection error" with a retry button rather than a diagnostic path.
2. **Addon UI divergence.** Addons render their own views with no enforced component contract; over time the product presents two vocabularies (core vs. addon). Q4 of /investigate targets this.
3. **SQLite as default** is fine for single-instance panels but is a scaling ceiling — many nodes, heavy analytics, concurrent sessions. Named threshold in scalability below.
4. **CSP nonce + addon inline JS** is a latent conflict: the security posture that protects users also constrains the extension model.

---

## Process architecture — the three operator jobs

### Job A: Provision something new
`decide → create node → install daemon → handshake → create server → allocate ports → pull image → container up → verify` — **8 steps, 2 manual/out-of-band.** Decision points: which node (capacity), which image (game type), which user (ownership), which limits (resources). Exception path: daemon won't connect → retry or re-key; image pull fails → partial container state.

### Job B: Fix a problem (incident)
`notice (dashboard status) → open server → read state → console logs → diagnose → act (start/stop/restart/edit file/reinstall) → verify → note for later` — all in-panel by design. Decision points: is it the daemon, the container, the config, or resources? Exception path: daemon offline → banner + retry; container crash-loop → logs + reinstall.

### Job C: Manage state at scale (bulk/ops)
`files multi-select → bulk archive/rename/delete → confirm → progress → verify` — selection persists to sessionStorage, keyboard shortcuts (Escape, Delete), floating action bar. This is the panel's best backstage-process support and the pattern every other bulk surface should match.

---

## State & failure analysis

### System states (panel-level)
| State | Trigger | User experience |
|---|---|---|
| Healthy | All deps up | Normal |
| Daemon-degraded | One+ node unreachable | Inline banners, retry buttons, per-server offline states (files table replaced with offline card) |
| Panel-degraded | DB slow/locked | Sessions degrade, writes slow |
| Addon-degraded | One addon crashes | **Must not** take the panel down (import() is per-addon; boot is version-gated) |
| Maintenance | Panel restarting | Page loader overlay |

### Failure modes (with blast radius)
| Failure | Blast radius | User sees | Recovery path |
|---|---|---|---|
| Daemon down | All servers on that node | Offline banners, console/status read-only fail | Admin restarts daemon, retry in UI |
| Node key mismatch | One node | "Connection error", retry button | Reconfigure daemon key out-of-band |
| Install interrupted | One server | Install banner stuck/failed | Reinstall from settings |
| Image pull failure | One server | Create fails / partial state | Retry, swap image |
| DB lock (SQLite) | Whole panel | Slow / errors | Migrate to MySQL (documented path) |
| Addon boot crash | One addon | Addon pages 404/error | Disable addon, restart panel |
| CSP blocks addon inline JS | One addon's page | Broken interactivity | Addon must use nonce-safe patterns |

### Graceful degradation tiers
1. **Tier 0 (panel core):** auth, dashboard, account, settings — depend only on panel + DB.
2. **Tier 1 (read-only server data):** status, players, backups list — need daemon; degrade to cached/last-known where possible.
3. **Tier 2 (mutations):** power, files, console — need daemon; refuse cleanly with a diagnostic, never a hang.

---

## Scalability & evolution

- **Known scaling thresholds:** SQLite (default) degrades under concurrent writes and heavy analytics — inflection around a mid-fleet multi-tenant install. MySQL is the documented migration. Analytics pages do live aggregation; at fleet scale they should read precomputed rolls.
- **Daemon per node** scales horizontally by design (add nodes, not panel instances). The single-panel-many-daemons model is the right architecture for a control plane.
- **Multi-context:** one product, three privilege levels, 10 languages, theme system (light/dark/user themes). The adapters exist; the /localize and /include passes make them uniform.
- **Governance:** module version-checking and addon boot isolation are the existing governance. Missing: an enforced addon UI contract (see /specify).

## Pending questions

- What is the operational SLA for a node handshake today — is there timeout/retry with backoff on the daemon client? *(Needs engineering read of `serverConsole.ts`/daemon client; /specify should confirm.)*
- Should the addon UI contract be enforced (lint/build gate) or documented (reference) first? *(/investigate Q4 and /specify decide.)*
- Is there a design for *read-only degraded* server data (Tier 1) or is it all-or-nothing today? *(/fortify owns this.)*
