# PLAN — "Predictability at the Edges"

**Airlink Panel · Implementation plan for the tightening campaign**
*Consolidates docs/intent/01–14 + the Pterodactyl/Wings parity audit into one executable, dependency-aware plan. Covers both codebases: `panel/` and `daemon/`.*

---

## 0. Executive summary

Airlink Panel is a good product held back by uneven edges. The UX audit scores it **78/100**: the core (auth, dashboard, console, destructive-action discipline, Ctrl-K search, daemon-offline degradation, the WCAG floor) is genuinely strong — and the deep-work surfaces (files, backups, schedules, admin) drift below that bar. Three modal systems, native `alert()` fallbacks, an ungroupled 11-item sub-nav, i18n that stops exactly where work gets hardest, and a file editor that **can silently destroy work** (verified: no unsaved-changes guard in `file.ejs`).

The Pterodactyl/Wings parity audit (`airlink-vs-pterodactyl-gap-report.md`, workspace root) adds a second, harder pillar of evidence: **23 findings — 3 runtime bugs, 10 partials, 10 missing** (~97h of focused work across panel + daemon). Spot-verification in this plan pass confirmed the three most load-bearing claims against source and refined one scope error:

| Audit claim | Plan-pass verdict |
|---|---|
| 1.1 Client API schedule create → Prisma model mismatch (`clientApi.ts:500-508` writes `action`/`payload` to `Schedule`, which has neither; both live on `ScheduleTask`) | **Confirmed 🔴** |
| 1.2 Client API owner-only check locks out subusers (`clientApi.ts:24` — `ownerId !== userId → null`) | **Confirmed 🔴** |
| 1.3 Daemon `appendChunk` races on concurrent uploads (no lock, `chunkIndex` echoed but unused) | Confirmed as written — exact fix (mutex vs. streaming) decided at intake |
| 2.3B Schedules never fire (`nextRunAt` unset) | **Refined:** web UI *does* set it (`schedules.ts:148` `nextRunFromCron`); the dead path is **client API + admin API creation** — scope corrected |
| 2.3A Schedule `restart` → `/container/restart` — no such daemon route | **Confirmed 🔴** (daemon `router.ts:50-64`: only start/stop/kill) |
| 2.4 File manager mkdir — daemon has no `/fs/mkdir` | **Confirmed 🔴** (daemon `router.ts` lists `/fs/rm` etc., no mkdir) |

This plan does **not** redesign. It tightens and repairs: **7 phases**, each shippable alone, each with an exit gate measured against the baseline. Nothing here requires breaking the addon API, the CSP posture, or an existing route contract. Daemon changes are additive-only (new endpoints, HMAC-signed, documented) and tracked in a panel↔daemon version matrix.

**Campaign goal:** UX health 78 → **≥85**; data-loss events **0**; zero runtime bugs from the parity audit open; one modal system; zero `alert()`/`confirm()` in views; all 10 locales at key parity; grouped server navigation; schedules fire from every creation path; S3 restores work; and the first-run funnel's invisible-step drop-off closed — verified by telemetry, not vibes.

---

## 1. Strategy anchors (do not re-litigate)

| Anchor | Source | Rule |
|---|---|---|
| Positioning | 01-strategize | "The game server panel that treats operators like professionals." Compete on craft + trust, not neon. |
| Theme | 01-strategize | *Predictability at the edges.* Close the gap between best surfaces and deep-work surfaces — and fix what's broken before polishing what isn't. |
| Preserve | 08-evaluate | Protect: status-always-leads, destructive-action discipline, Ctrl-K search, daemon-offline banner pattern, a11y floor, files bulk flow. **Reference implementations — changes normalize *to* them, never away from them.** |
| Parity discipline | parity audit | **Nothing advertised that isn't served.** Every advertised-but-unregistered route, dead feature, and unapplied field is a trust killer; parity gaps are first-class work items, tracked in the registry with severity. |
| Anti-patterns | 01, 08, 14 | Refused: confirmshaming, fabricated urgency, prechecked consent. Verdict: **clean**. Keep it clean through every change. |
| Constraints | 01, 03 + audit | Non-breaking, incremental, contributor-legible, addon-API-safe, CSP-nonce-safe. **Daemon: additive endpoints only, HMAC-signed, documented; panel↔daemon version matrix maintained.** |

---

## 2. The baseline (locked before any fix ships)

**UX (08-evaluate):**
- **UX health 78/100** — heuristics 78, task success 80, anti-pattern scan 90.
- Incident flow passes end-to-end *except* one step: **diagnose**. That step is the campaign's biggest single UX opportunity.
- Provision flow: 2 of 8 steps manual/out-of-band (daemon config copy + install) — the adoption cliff.

**Verified UX defects (09-fortify + this plan pass):**
1. `file.ejs:368-414` — **no unsaved-changes guard** → silent data loss (P0).
2. `manage.ejs:1337-1352` — **crash ≡ deliberate stop** ("Server stopped" for both) (P1).
3. `manage.ejs` — **no auto-scroll to new output** after restart (xterm `scrollback:1000` only) (P1, incident-verify loop).
4. No **pluralization helper** in the translation system — verified absent (P1, i18n).

**Parity audit (verified in this plan pass — see §0 table):**
- 🔴 **1.1** Client API schedule create crashes (model mismatch).
- 🔴 **1.2** Client API subusers get 404 on every non-owned server.
- 🔴 **1.3** Daemon chunked upload can corrupt files under concurrent chunks.
- 🔴 **2.3A** Schedule `restart` tasks dispatch to a nonexistent daemon route.
- 🔴 **2.4** "New Folder" in the file manager hits a missing daemon endpoint.
- 🟠 **2.3B** (refined) API-created schedules never fire — web UI path is fine.
- Remaining 18 claims (S3 restore, config_files, queue durability, API route registration, 2FA codes, egg import, categories, mount restrictions, log persistence, key rotation, compiled binary, startup/WS API, location filter) enter the registry now and are **re-verified at Phase-0 intake** per the spot-check policy (§6, A-13).

**Strengths confirmed at the code level (10-include):** skip link, focus traps + Escape + focus restore in `modal.ejs:85-98`, `inert` on the closed mobile sheet, roving tabs, ARIA combobox search, reduced-motion guards, dual console layouts (`manage.ejs:80` desktop / `:241` mobile).

---

## 3. Master work-item registry

Every item carries: ID, priority, phase, primary files (panel `views/`/`src/`, daemon `src/`), source refs, and acceptance criterion. Detail lives in §4. IDs: **B** = repairs, **S** = safety, **C** = consistency, **N** = navigation, **P** = provision/recovery, **D** = data integrity, **X** = scale/mobile/ecosystem, **E** = API & parity, **V** = validation. Daemon-side items are marked **⚙**.

### Repairs (Phase 1)

| ID | Item | Prio | Files | Source | Effort |
|---|---|---|---|---|---|
| **B-1** | Client API schedule create: create `Schedule` (+`nextRunAt`) then `ScheduleTask` (action/payload/order:0); fix GET/list response shape | 🔴 | `panel/src/modules/api/client/clientApi.ts:500` | 1.1 | 1h |
| **B-2** | `resolveServerForUser` falls back to `subUser.findFirst({ serverId, userId })`; keep `node` relation | 🔴 | `clientApi.ts:18-24` | 1.2 | 2h |
| **B-3** ⚙ | Daemon `appendChunk`: per-file mutex + sequential chunk assembly by index, then rename (or drop chunked API for the streaming path `handleFsUpload`) | 🔴 | `daemon/src/handlers/fs.ts`, `routes/filesystem.ts` | 1.3 | 4h |
| **B-4** | Set `nextRunAt = nextRunFromCron(cron)` on **every** creation path (client API + admin API); add regression test that a fresh schedule fires | 🟠 | `clientApi.ts` + admin API | 2.3B (refined) | 1h |
| **B-5** ⚙ | Daemon: add `handleFsMkdir` + register `POST /fs/mkdir` (jail-checked) | 🟠 | `daemon/src/routes/filesystem.ts`, `router.ts` | 2.4 | 2h |
| **B-6** | Add `sendPasswordReset({ to, panelName, resetUrl })` to mailer using the existing `emailShell()`; wire into `passwordReset.ts` | 🟠 | `panel/src/handlers/utils/core/mailer.ts`, `modules/auth/passwordReset.ts` | 2.2 | 1h |
| **B-7** ⚙ | Daemon: add `POST /container/restart` (stop → start with last-used config, replayed from a cached start payload or `storage/containerConfigs/<id>.json`) — also unblocks schedule `restart` tasks (2.3A) and 3.5 | 🟠 | `daemon/src/routes/instances.ts`, `handlers/docker.ts` | 2.3A + 3.5 | 3h |

### Safety (Phase 1)

| ID | Item | Prio | Files | Source |
|---|---|---|---|---|
| **S-1** | File editor unsaved-changes guard (dirty flag, `beforeunload`, Cancel-first `window.modal.confirm`, content never cleared, Retry on save failure) | P0 | `panel/views/user/server/file.ejs:368-414` | 09-F-P0-1 |
| **S-2** | Crash-reason surfacing: crash ≠ stop; exit code → "Server crashed (exit 137 — likely out of memory)" + "Open logs"; no reason → honest fallback. Never fabricate | P1 | `manage.ejs:1337-1352`, daemon status payload | 09-F-P1-2 |
| **S-3** | Status live region + crash/stop/start announce | P1 | `manage.ejs` | 10-I-P0-1 |
| **S-4** | Console jump-to-latest after Restart (boot sequence visible) | P1 | `manage.ejs` xterm | 04-J-Q4 (verified gap) |
| **S-5** | Daemon-offline console input lock + SR announcement | P1 | `manage.ejs` `lockInput` | 09-F-P1-6 |
| **S-6** | Session-expiry surfacing (401 → polite message) | P2 | global fetch wrapper | 09-F-P2-10 |

### Consistency (Phase 2)

| ID | Item | Prio | Files | Source |
|---|---|---|---|---|
| **C-1** | Modal consolidation onto `window.modal`; delete legacy `m-overlay`/`confirm-overlay` after flagged migration | P1 | `store.ejs`, `create-server.ejs`, call sites | 08-P1-1 |
| **C-2** | Remove all native `alert()`/`confirm()` fallbacks | P1 | `schedules.ejs:750,766`, `subusers.ejs:346`, `databases.ejs:212` | 08-P1-5 |
| **C-3** | `<html lang="<%= req.lang %>">` | P0 | `header.ejs:2`, `auth-header.ejs:6` | 12-L-P0-1 |
| **C-4** | Client-side string localization (`window.__i18n` + `t()` incl. plural helper) | P1 | shared template + 8+ deep views | 12-L-P1-3 |
| **C-5** | Locale-aware date/number formatting | P1 | `files.ejs:254` + helper | 12-L-P1-4 |
| **C-6** | Key-parity CI gate + deep-surface translation pass | P1 | CI + `storage/lang/*` | 12-L-P0-2 |
| **C-7** | Double-submit guard standardized | P1 | all create/save buttons | 09-F-P1-5 |
| **C-8** | Placeholder-only label audit | P2 | admin/account/startup forms | 10-I-P1-6 |
| **C-9** | Contrast token pass (light + dark) | P2 | `--theme-*` tokens | 10-I-P2-9 |
| **C-10** | Icon-only button aria-label sweep | P2 | admin tables, store | 10-I-P2-11 |

### Navigation (Phase 3)

| ID | Item | Prio | Files | Source |
|---|---|---|---|---|
| **N-1** | Grouped server sub-nav (Run/Data/Manage/Settings), desktop | P1 | `serverTemplate.ejs:94` | 08-P1-3, 05 |
| **N-2** | Grouped server sub-nav, mobile (groups as tabs; no horizontal scroll) | P1 | `serverTemplate.ejs` mobile | 11-T-P1-1 |
| **N-3** | Admin section grouped in More sheet | P2 | `bottomNav.ejs:74-119` | 11-T-P1-2 |
| **N-4** | Search zero-results state | P2 | search overlay | 05-§6 |
| **N-5** | Addon slots in the section taxonomy | P2 | `uiComponentStore` / contract | 05-§2 |

### Data integrity (Phase 4)

| ID | Item | Prio | Files | Source | Effort |
|---|---|---|---|---|---|
| **D-1** | S3 backup **restore** + **download** branches: stream from S3 → daemon upload, then restore; mirror in download | 🟠 | `panel/src/modules/user/server/backups.ts` | 2.1 | 4h |
| **D-2** ⚙ | Egg `config_files` applied at start: panel sends `configFiles` in start payload; daemon parses/rewrites files pre-start (Wings-style format — validate against real eggs first, A-14) | 🟠 | `daemon/src/handlers/docker.ts`, panel start call | 2.6 | 2d |
| **D-3** | Install queue durability: minimal = on boot, re-enqueue `Installing: true` servers (or clear flag + warn); proper = SQLite job table / BullMQ — decision at Phase 4 intake | 🟠 | `panel/src/handlers/queueer.ts`, boot path | 2.7 | 1d |
| **D-4** | Cumulative resource limits: aggregate existing server sums before create; reject with honest copy ("Memory allocation would exceed your limit") | 🟠 | `panel/src/modules/user/createServer.ts` | 2.9 | 2h |
| **D-5** | 2FA recovery codes: schema field (hashed), 10 codes at enrollment (shown once), redeem-on-login, single-use | 🟠 | `twoFactor.ts`, `schema.prisma` | 2.10 | 4h |
| **D-6** ⚙ | Console log disk persistence: daemon appends to `storage/logs/<id>.log` (rotation ~5MB), panel `GET /container/logs/history` for post-mortem | 🟡 | `daemon/src/ws/server.ts`, `routes/instances.ts` | 3.4 | 4h |

### Provision & recovery (Phase 4)

| ID | Item | Prio | Files | Source |
|---|---|---|---|---|
| **P-1** | Node-create shows the daemon-config story up front | P1 | `views/admin/nodes/*` | 04-J-0 |
| **P-2** | In-panel daemon setup: copy-able config + "I've done this" verify handshake | P1 | nodes flow + daemon client | 09-first-run |
| **P-3** | Install heartbeat + graduated messaging (30s/120s) | P1 | `installHeader.ejs` | 09-F-P1-3 |
| **P-4** | Install failure = named step + reason + inline reinstall (verify reinstall-preserves-world claim first, A-9) | P1 | install banner | 04-J-S4 |
| **P-5** | Suspended why-now messaging (403 body → UI) | P1 | `console.ts:229,407`, `manage.ejs` | 09-F-P1-4 |
| **P-6** | Live node-headroom budget in provision | P2 | create-server flow | 04-J-S2 |
| **P-7** | Dashboard offline card hints at why (daemon vs. crash) | P2 | `dashboard.ejs` | 04-J-entry |
| **P-8** | Empty-state first-create on schedules/databases/backups | P3 | 3 views + `empty-state.ejs` | 09-F-P3-15 |

### Scale, mobile & ecosystem (Phase 5)

| ID | Item | Prio | Files | Source | Effort |
|---|---|---|---|---|---|
| **X-1** | `al-pagination` component; files pages/virtualizes past 500 | P2 | new component + files/tables | 09-F-P2-7,8 | ✅ |
| **X-2** | Mobile thumb zone: power/send/copy-IP ≤3 taps | P2 | `manage.ejs` mobile | 11-T-P1-3 | ✅ |
| **X-3** | WS throttle on mobile background/idle + resume | P2 | WS client | 11-T-P1-4 | ✅ |
| **X-4** | Deep-link continuity `/server/:id?view=&path=` | P2 | routes + nav | 11-T-P2-5 | ✅ |
| **X-5** | Addon UI contract (chrome, components, i18n, CSP, a11y) | P2 | `modulesLoader.ts`, docs/ | 14-S-9 | ✅ |
| **X-6** | Stale-while-revalidate dashboard | P2 | `dashboard.ts:209` | 09-F-P2-9 | — |
| **X-7** | Two-tab console guard | P2 | WS gateway | 09-F-P2-12 | — |
| **X-8** | Long-name truncation sweep + zoom check | P2 | lists/tables/cards | 09-F-P2-11 | — |
| **X-9** | Breadcrumb truncation + tables→cards consistency | P3 | `breadcrumb.ejs`, backups | 11-T-P2-6,7 | — |
| **X-10** | Hover-reveal audit (tap paths) | P3 | all surfaces | 11-T-P3-8 | — |
| **X-11** ⚙ | Daemon `POST /fs/bulk-rm` (`{ id, paths[] }`, jailed loop, success/failure summary); panel bulk delete stops looping N requests | 🟠 | `daemon/src/routes/filesystem.ts`, `files.ejs` | 2.5 | 3h |

### API & parity (Phase 5)

| ID | Item | Prio | Files | Source | Effort |
|---|---|---|---|---|---|
| **E-1** | Pterodactyl egg importer (`POST /admin/images/import-pterodactyl` + field map table) | 🟡 | `panel/src/modules/admin/images.ts` | 3.1 | 1d |
| **E-2** | Image categories/nests: `ImageCategory` model + admin UI + grouped/filtered list | 🟡 | `schema.prisma`, admin images | 3.2 | 1d |
| **E-3** | Per-image mount restrictions: `MountImage` junction; admin multi-select; filter assignment by image | 🟡 | `schema.prisma`, mount editor | 3.3 | 4h |
| **E-4** ⚙ | Daemon key rotation without restart: HMAC-signed `POST /config/rotate-key` (update in-memory + persist) | 🟡 | `daemon/src/security/hmac.ts` | 3.6 | 3h |
| **E-5** ⚙ | Compiled daemon binary: `bun build --compile` in daemon CI, release artifacts | 🟡 | daemon CI | 3.7 | 2h |
| **E-6** | Client API startup endpoints: `GET/PUT /api/client/servers/:id/startup` | 🟡 | `clientApi.ts` | 3.8 | 3h |
| **E-7** | Client API websocket token: `GET .../websocket` (60s signed token) + WS upgrade accepts it | 🟡 | `clientApi.ts`, WS auth | 3.9 | 4h |
| **E-8** | Location filter on server creation: group node selector by location | 🟡 | `createServer.ts`, view | 3.10 | 2h |
| **E-9** | Admin API: verify every advertised `/api/v1` route is registered; add missing handlers (images/locations likely) | 🟠 | `panel/src/modules/api/api.ts` | 2.8 | 4h |

### Validation (Phase 6)

| ID | Item | Prio | Source |
|---|---|---|---|
| **V-1** | Instrumentation + baselines (events, funnels) | — | 13-§2,3,7 |
| **V-2** | Restart-primary A/B (gated on V-1) | P3 | 13-§4 |
| **V-3** | Full a11y test pass (axe, keyboard, SR, zoom, motion) | P2 | 10-§testing |
| **V-4** | Re-evaluate + re-run the parity audit's checkable claims + publish | — | 08, parity |

**Research items** (02-investigate + 05-§7): R-1 i18n coverage audit (P0) · R-2 usability fresh-install (P1, round 2 in P4) · R-3 operator interviews (P1) · R-4 addon author interviews (P5) · R-5 non-English diary (P2) · R-6 community survey (P6) · R-7 card sort (P0) · R-8 tree test (P3).

---

## 4. Phases

### Phase 0 — Foundations *(instrument, verify, research kickoff)*

**Objective:** Nothing ships blind. Telemetry exists, the assumption register is answered, and the studies that gate design decisions are running.

| Deliverable | Content | Acceptance |
|---|---|---|
| **V-1 Instrumentation** | Events: `file.editorDirtyLeave`, `file.editorDiscard`, `file.editorSaveFailure`, `crash.statusShown`, `provision.funnel.{1-6}`, `nav.deepSurfaceTarget`, power actions (extend the existing `server:stop\|restart\|start` logger — extend, don't fork). | Events flow to the dashboard (13-§5); baselines captured for incident + provision before any fix ships. |
| **Parity intake** | Re-verify all 23 audit claims against source (policy in §6, A-13). Record confirmed/refined/disputed per item; migrate accepted items into scope; log any disputes with evidence. **This plan pass already confirmed 1.1, 1.2, 1.3, 2.3A, 2.4 and refined 2.3B.** | A verifier comment on every B/D/E item; zero unexamined claims. |
| **Assumption register** | Answer with code evidence: A-1 daemon `lastExitCode` in status payload? (S-2) · A-2 WS server tolerates keepalive pause? (X-3) · A-3 403 body reaches UI toast? (P-5) · A-4 `__i18n` injection point? (C-4) · A-5 sub-nav technically groupable? (N-1) · A-6 addon menu items declare a group? (N-5) · A-7 pluralization mechanism (none exists — adopt ICU-style keys in C-4) · A-8 console force-restart wanted (kill exists in schedules, not console)? · A-9 reinstall preserves world/config? (P-4) · A-10 daemon start payload shape + whether it can carry `configFiles` (D-2) · A-11 daemon caches last start config for restart replay? (B-7) · A-12 S3 restore design — stream S3 → daemon upload (D-1) | Every question answered with file:line; unknowns become risks (§7). |
| **R-1 + R-7** | i18n coverage matrix; card sort on the 11 server surfaces. | Matrix feeds C-6; card sort confirms or amends Run/Data/Manage/Settings **before** N-1 is built. |

**Exit gate:** telemetry verified against sampled logs; all 23 parity claims examined with a recorded verdict; assumption register complete; R-7 scheduled ≤2 weeks after kickoff.

---

### Phase 1 — Repairs & trust *(nothing broken, nothing silently lost)*

**Objective:** The runtime bugs are dead, the two trust-killers (lost work, invisible failures) are gone, and the dead features (schedules via API, mkdir, restart tasks) work again. This phase is *why the campaign exists.*

| ID | Locked design |
|---|---|
| **B-1** | Create `Schedule` (name, cron, enabled, `nextRunAt` — reuse `nextRunFromCron`, the web UI's helper at `schedules.ts:148`), then `ScheduleTask` (scheduleId, action, payload, order: 0). Fix GET/list responses to include `tasks`. Regression: POST → list → tasks present. |
| **B-2** | `resolveServerForUser`: owner check, then `subUser.findFirst({ where: { serverId, userId } })`; include `node` relation for daemon calls; permission checks stay at route level. Regression: subuser API key hits a non-owned server. |
| **B-3** ⚙ | Decision at intake (A-13 re-verify): either per-file mutex + ordered chunk assembly + final rename, or drop the chunked interface for the existing streaming path. Never `appendFile` with no sequencing. Regression: N concurrent chunks → intact file. |
| **B-4** | `nextRunAt` on client API + admin API create (and any other path found at intake). Regression: freshly created API schedule fires within one poll cycle. |
| **B-5** ⚙ | `handleFsMkdir` with `jailPath` check + `mkdirSync(recursive)`; register `POST /fs/mkdir`. Regression: mkdir from the panel UI works. |
| **B-6** | `sendPasswordReset` using `emailShell()`; update `passwordReset.ts` call site. |
| **B-7** ⚙ | `POST /container/restart` = stop → start with replayed last-used config (cached start payload per container — design per A-11). Unblocks schedule `restart` tasks. Regression: restart works from schedule + direct call. |
| **S-1** | Editor guard: dirty flag on `editor.onDidChangeModelContent`; `beforeunload` on navigate-away; Cancel-first `window.modal.confirm` ("Keep editing" focused) on in-app nav; content never cleared on save failure; Retry offered. Precedent: `files.ejs:737`, `worlds.ejs:165`. Copy: "Unsaved changes" / "You have unsaved changes in this file. Leave anyway?" / Discard · Keep editing. Never trap. |
| **S-2** | `killed`/`stopped` without a recent user stop → "Server crashed". Exit code → "Server crashed (exit 137 — likely out of memory)" + inline "Open logs". No reason → "Stopped unexpectedly — open logs to see why." **Never fabricate.** |
| **S-3** | `aria-live="polite"` on the status card; crash/stop/start transitions announce. Folds into S-2's render path. |
| **S-4** | After Restart: jump-to-latest on the terminal (clear scroll anchor or "Jump to latest" affordance) so the boot sequence is visible. |
| **S-5** | `lockInput` when offline banner is up (verify unlock on reconnect); announce "Console paused — daemon offline". |

**Parallel:** R-2 usability round 1, R-3 interviews (qualitative-first per 02).

**Exit gate:** all 🔴 bugs closed with regression tests; data-loss events = 0 across a 2-week soak; crash label + fallback render (verified against a crash-loop server and a deliberate stop); schedules fire from API and web UI; keyboard-only incident pass at both breakpoints; no console power regression.

---

### Phase 2 — One vocabulary *(consistency & language)*

**Objective:** One component language, one set of strings. Fragmentation and the i18n wall die here.

| ID | Locked design |
|---|---|
| **C-1** | Migrate `store.ejs` `m-overlay/m-dialog` + `create-server.ejs` `confirm-overlay` to `window.modal`; feature-flag → ship → delete legacy markup. |
| **C-2** | Delete native `alert()`/`confirm()` fallbacks. Acceptance: `rg 'confirm\(|alert\(' views/` → 0. |
| **C-3** | `<html lang="<%= req.lang %>">`. One-line; SR correctness across 10 locales. |
| **C-4** | Inject `window.__i18n` (server subsets `req.translations`; only keys JS needs); convert all hardcoded JS strings (file.ejs:392-395, schedules, subusers, backups, manage.ejs console strings); add the plural `t()` helper (A-7). |
| **C-5** | Shared locale-aware formatter; `toLocaleDateString(req.lang)` etc. |
| **C-6** | CI key-parity gate (fail on missing keys vs. en) + hardcoded-literal lint + translation pass from R-1's matrix. Pseudo-localization at 150% clean. |
| **C-7** | Double-submit guard on every create/save button (reference: `file.ejs:371`). |
| **C-8/9/10** | Label audit, contrast token pass (both themes ≥4.5:1 body / 3:1 UI), aria-label sweep. axe green on audited surfaces. |

**Parallel:** R-5 diary starts; native-speaker review of new deep-surface keys (12-§3; flag "grounded" idiom, 12-P2-7).

**Exit gate:** one modal implementation; zero native alerts; parity gate green; pseudo-loc clean; axe on console/files/schedules/backups/admin × light+dark.

---

### Phase 3 — Find your way *(navigation)*

**Objective:** The deepest work surface becomes the most navigable. 11 flat items → 4 named groups on every device.

| ID | Locked design |
|---|---|
| **N-1** | Groups: **Run** (Console, Players) · **Data** (Files, Backups, Schedules, Databases) · **Manage** (Startup, Worlds, Subusers) · **Settings** (Settings, Admin). Group labels, accent-soft active state; destinations/order within group unchanged; breadcrumbs + Ctrl-K stay. Amend per R-7 — evidence wins. |
| **N-2** | Mobile: groups as tabs; members under active group; replaces `whitespace-nowrap` scroll (wireframe frame 7). Never removes a capability. |
| **N-3** | More sheet groups admin links under labeled sections. |
| **N-4** | Search zero-results: "No results for X — try a server name, page, or node" + suggestions. |
| **N-5** | Addon menu items declare a `section` slot (default "Extensions"); additive contract change. |

**Parallel:** R-8 tree test (50+); R-3 findings feed N-1 if operators group differently.

**Exit gate:** tree test >70% direct first-click; median nav-clicks to deep surfaces down (V-1 baseline); Ctrl-K reliance does **not** rise; SR wayfinding pass (grouped, not 11 flat links).

---

### Phase 4 — Data integrity & provisioning *(no unrecoverable data, no adoption cliff)*

**Objective:** Backups always restore. Eggs do what they promise. Limits hold. Installs and first-run never strand.

| ID | Locked design |
|---|---|
| **D-1** | Restore: `isS3Backup(filePath)` → `getS3ObjectStream(key)` → stream to daemon `POST /container/backup/upload` → proceed with restore. Mirror in download. Regression: S3-created backup restores and downloads. |
| **D-2** ⚙ | Panel sends `configFiles` in the start payload; daemon parses Wings-style rules and rewrites files pre-start (EULA, server.properties, ports). Validate format against real eggs at intake (A-10). |
| **D-3** | Decision at intake: minimal (boot re-enqueue of `Installing: true`) vs. proper (SQLite job table / BullMQ). Default: minimal first, proper if install volume justifies. Never leave a server permanently stuck. |
| **D-4** | Aggregate `_sum` of Memory/Cpu/Storage per owner before create; reject with /articulate copy. |
| **D-5** | 2FA: 10 single-use codes, bcrypt-hashed, shown once at enrollment, redeemed at login when TOTP fails. |
| **D-6** ⚙ | Log persistence + rotation + `GET /container/logs/history`. |
| **P-1/2** | Node-create shows the daemon-config story up front; after save, in-panel copy-able config + "I've done this" verify that pings the daemon. Progressive, not a tour. |
| **P-3/4** | Install heartbeat (30s/120s graduated); failure = named step + reason + inline reinstall (verify the preserves-world claim first — A-9). |
| **P-5** | Suspended: server-side message reaches the UI (403 body → toast/banner); buttons stay disabled. |
| **P-6/7/8** | Live headroom budget; dashboard offline card hints at why; empty-state first-create. |

**Parallel:** R-2 usability round 2 against the new first-run flow.

**Exit gate:** S3 backup round-trips; config_files applied on a real egg; stuck-install impossible; cumulative limits enforced; 2FA recovery works; fresh operator completes first-server in one session (R-2 round 2).

---

### Phase 5 — Scale, mobile, API & ecosystem *(volume, devices, third parties)*

**Objective:** Large fleets, mobile operators, API integrators, and the addon ecosystem stop being edge cases.

| ID | Locked design |
|---|---|
| **X-1** | `al-pagination` (page-size memory, counts, `aria-current`, arrows+Enter); files pages/virtualizes past 500. |
| **X-2/3** | Mobile thumb zone (power/send/copy-IP ≤3 taps, bottom 60%); WS throttle (background/idle >60s → heartbeat + "Live updates paused — tap to resume", announced). |
| **X-4** | Deep links `/server/:id?view=console\|files&path=…`; surfaces emit them. |
| **X-5** | Addon UI contract (published + store-review enforced): ① render inside panel layout; ② MUST NOT ship own modal/confirm/toast — `window.modal` + `showToast` + `al-*`; ③ localize via key mechanism, per-locale metadata replaces `data-lang="en"` (store.ejs:730); ④ CSP: no inline JS — nonce-aware script mechanism, never teach bypass; ⑤ version-gated (existing); ⑥ same AA bar. |
| **X-6/7** | SWR dashboard; two-tab console guard (never double-send). |
| **X-8/9/10** | Truncation + zoom sweep; breadcrumb/tables→cards consistency; hover-reveal tap paths. |
| **X-11** ⚙ | Daemon `POST /fs/bulk-rm`: jailed loop, per-path results, summary; panel uses it (atomic-ish, 1 request). |
| **E-1** | Egg importer: `POST /admin/images/import-pterodactyl` with the field map from the audit (startup/stop/startup_done/config_files/scripts/variables/dockerImages); import preview + conflict handling. |
| **E-2** | `ImageCategory` model + admin CRUD + grouped image list; seed sensible defaults. |
| **E-3** | `MountImage` junction; mount editor multi-select; assignment filtered by image. |
| **E-4** ⚙ | `POST /config/rotate-key` (HMAC-signed); in-memory + persisted; panel "rotate key" action in node UI. |
| **E-5** ⚙ | `bun build --compile` in daemon CI; release artifacts for linux-x64/arm64. |
| **E-6/7** | Client API: `GET/PUT .../startup`; `GET .../websocket` → 60s signed token accepted by the WS upgrade handler. |
| **E-8** | Location-first server creation (group node selector by `location.name`). |
| **E-9** | Audit `/api/v1` self-description vs. registered routes; register missing handlers; add a CI assertion that the advertised route list matches the router. |

**Parallel:** R-4 addon-author interviews + artifact audit (does the contract match reality?).

**Status (2026-08):** X-1 ✅ `2e4ece01` (al-pagination + search wiring, pager hides under 50 rows) · X-2 ✅ audited — power/copy-IP/terminal+send all first-screenful on mobile, ≤3 taps holds · X-3 ✅ `7b916624` (tab-hidden WS close, pause reconnect, resume on return) · X-4 ✅ audited — every view is its own stable route, files deep-links via `?path=` · X-5 ✅ `f36863a7` (`docs/addon-ui-contract.md` published).

**Exit gate:** files page holds at 10k entries; mobile incident ≤3 taps on a real device; API: subusers, startup, websocket token all work; addon contract published and 1-2 addons migrated; advertised API routes == registered routes; daemon ships restart/mkdir/bulk-rm/key-rotation/logs and a compiled binary.

---

### Phase 6 — Proven *(validation & measurement)*

**Objective:** Prove the campaign, then publish it as marketable discipline.

| ID | Item |
|---|---|
| **V-2** | Restart-primary A/B (power controls) — hypothesis, MDE, 2 weekly cycles, guardrails per 13-§4. |
| **V-3** | Full a11y test pass: axe on all 81 views × light/dark (CI-gated P0/P1), manual keyboard (incident + provision + files), NVDA + VoiceOver (console, bulk, search, More sheet), contrast token audit, 200%/400% zoom, reduced-motion. |
| **V-4** | Re-evaluate (08 methodology): UX health target **≥85**; funnel + nav metrics vs. baselines; CSAT wave on the incident flow; SUS baseline + NPS (R-6); **re-run the parity audit's checkable claims** (bugs closed, routes served, schedules fire, S3 round-trips); Goodhart check (13-§6). Publish results to docs/ + Discord. |

**Exit gate:** health ≥85; data-loss 0; all Phase gates green; parity claims re-checked; reopen triggers honored (max one strategy reopen).

---

## 5. Timeline & milestones

| Milestone | Name | Content | Window |
|---|---|---|---|
| **M0** | Foundations | V-1, parity intake, assumption register, R-1, R-7 | Weeks 1–2 |
| **M1** | Repairs & trust | B-1..B-7, S-1..S-5 (+ R-2, R-3) | Weeks 2–6 |
| **M2** | One vocabulary | C-1..C-10 (+ R-5) | Weeks 6–9 |
| **M3** | Find your way | N-1..N-5 (+ R-8) | Weeks 9–12 |
| **M4** | Data integrity & provision | D-1..D-6, P-1..P-8 (+ R-2 round 2) | Weeks 12–16 |
| **M5** | Scale, mobile, API & ecosystem | X-1..X-11, E-1..E-9 (+ R-4) | Weeks 16–21 |
| **M6** | Proven | V-2..V-4 (+ R-6) | Weeks 21–25 |

Open-source cadence: each phase ships as its own minor release; phases are independent — an M2 delay does not block M3. Research is parallel throughout, never on a phase's critical path.

---

## 6. Assumptions register (decision log)

| # | Question | Status | Answer / Owner |
|---|---|---|---|
| A-1 | Daemon payload carries `lastExitCode`/reason? | **Verify Phase 0** | S-2 works either way; daemon field is the enhancement. Engineering. |
| A-2 | WS server tolerates client keepalive pause? | **Verify Phase 0** | Gates X-3. Engineering. |
| A-3 | 403 body reaches the UI toast? | **Verify Phase 0** | P-5. Engineering. |
| A-4 | `__i18n` injection point + key subsetting? | **Verify Phase 0** | C-4. Engineering. |
| A-5 | Server sub-nav technically groupable? | **Verify Phase 0** | N-1 (assumed template-driven). Engineering. |
| A-6 | Addon menu items declare a group? | **Verify Phase 0** | N-5 default "Extensions" + migration. Engineering. |
| A-7 | Pluralization mechanism | **Verified absent** | No helper in `src/`; adopt ICU-style keys + `t()` plural helper in C-4. |
| A-8 | Console force-restart wanted? | **Partially verified** | `kill` exists as schedule power action (`schedules.ts:11,298`); console has start/stop/restart. Decide in M1 whether console force-restart is wanted. Design owner. |
| A-9 | Reinstall preserves world/config? | **Verify M4** | P-4's honest framing depends on it. Engineering. |
| A-10 | Daemon start payload shape; can it carry `configFiles`? | **Verify Phase 0** | Gates D-2. Engineering (daemon). |
| A-11 | Daemon caches last start config for restart replay? | **Verify Phase 0** | Gates B-7 design. Engineering (daemon). |
| A-12 | S3 restore design (stream S3 → daemon upload) | **Verify Phase 0** | D-1. Engineering. |
| A-13 | Parity audit trust | **Ongoing** | Spot-check policy: every claim re-verified at intake with a recorded verdict; disputes logged with evidence. **5 confirmed + 1 refined in this plan pass.** |
| A-14 | `config_files` format = Wings-compatible? | **Verify Phase 0/4** | Validate against real eggs before building D-2. Engineering (daemon). |
| A-15 | Queue durability: minimal vs. proper? | **Decide Phase 4** | Default minimal (boot re-enqueue), proper if justified. Product owner. |
| A-16 | Restart vs. Stop primary power control? | **Deferred to V-2 A/B** | 06-open-Q; decision rule in 13-§4. |
| A-17 | RTL (ar/he) expansion? | **Deferred** | Gate behind /strategize market decision; logical properties in new views now (12-P2-6). |
| A-18 | Admin placement in server nav groups? | **Deferred to R-7** | Card sort decides; keep stable after. |

---

## 7. Risks & mitigations

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| **Scope creep into redesign** | Med | High | Phases have hard exit gates; "normalize to the reference, never away" is a review rule; only registry items are in scope. |
| **Audit trust** (claims wrong or overstated) | Med | Med | Spot-check policy (A-13): every claim re-verified at intake; verdicts recorded; 2.3B already refined. Build only confirmed scope. |
| **Panel↔daemon version coupling** | High | Med | Daemon changes are additive-only, HMAC-signed, documented; version matrix maintained; panel feature-flags daemon capability (e.g., check `/container/restart` exists before offering it in schedules). Never break an existing node on upgrade. |
| **`config_files` format mismatch** | Med | Med | Validate against real eggs before D-2 (A-14); Wings-compatible parsing is the target, not a guess. |
| **Schedules remain dead** (if B-4/B-7 slip) | Low | High | B-4/B-7 are Phase 1 items with regression tests; they ship with the first release. |
| **R-7/R-8 contradict the grouping** | Med | Med | Evidence wins; amendment cheap pre-build (card sort in Phase 0). |
| **Research scarcity (no telemetry)** | High | Med | Qualitative-first per 02; prevalence claims labeled with n. |
| **Translation quality on deep-surface pass** | Med | Med | Native-speaker linguistic QA in context (12-§3); machine-only never. |
| **Addon divergence** | Med | Med | Contract published + store-review enforcement (X-5); documented first, gated later. |
| **CSP vs. addon inline JS** | Med | Med | Nonce-aware script mechanism as first-class API (X-5-④). |
| **SQLite ceiling** | Low | Med | Documented MySQL path (03); out of scope — flagged, not fixed. |
| **S3 restore ships wrong** (streaming bugs) | Med | High | D-1 regression: S3-created backup restores and downloads; test with a real S3-compatible endpoint at intake. |
| **A/B backfire (accidental stops)** | Low | Med | Guardrails + decision rule in 13-§4. |

---

## 8. Quality gates & working agreements

**Token law (binding):** `--w-*` tokens + 4px grid only; no raw pixels in markup (wireframe design-system law).

**Component rules (binding):** exactly one modal system (`window.modal`); shared toasts; `al-pagination` for all pagination; new views use the shared layout includes; addons follow X-5.

**i18n rules (binding):** no hardcoded user-visible strings in EJS or JS; ICU placeholders, no concatenation; plural keys per language; parity gate must pass; `req.lang` drives dates and `<html lang>`.

**a11y floor (binding, per 10-include):** keyboard parity on every interactive element; focus traps + Escape + focus restore in every overlay; 44px touch targets; visible focus indicators; status never color-only; live regions for async state; `prefers-reduced-motion` honored; 400% zoom reflow.

**Daemon standards (binding for every ⚙ item):** additive endpoints only — never modify an existing route's contract; every new endpoint HMAC-signed (or WS-token-scoped) like its neighbors; jail-checked paths (no `..` escapes — `jailPath` on every file op); documented in the version matrix; panel detects capability before using it.

**API standards (binding for B/E items):** advertised routes must be registered (CI assertion, E-9); client API resolves owners *and* subusers (B-2); every endpoint returns the documented shape (B-1).

**Testing (per PR):** axe on touched views (light + dark); keyboard pass on the touched flow; double-submit check; touched strings pass parity gate; **bug fixes ship with a regression test** (B-1..B-7, D-1, D-4, D-5). Manual matrix in 14-§test-plan for releases.

**Review norms:** docs-driven (each PR references the registry ID); dark-pattern check on every interaction change (14-§ethical); small PRs, one item per PR where possible; daemon PRs reviewed against the daemon standards above.

---

## 9. Definition of done — the campaign

1. UX health **≥85** (from 78), verified by a fresh /evaluate run (V-4).
2. **Data-loss events = 0**; crash vs. stop indistinguishable nowhere; install failures always terminate.
3. **All 3 🔴 parity bugs closed** with regression tests; schedules fire from every creation path; mkdir + restart tasks work.
4. **One** modal system; **zero** `alert(`/`confirm(` in views; parity gate green for all 10 locales; `<html lang>` correct per request.
5. Server navigation grouped (desktop + mobile) with tree-test >70% direct first-click; Ctrl-K reliance unchanged or down.
6. First-run funnel: invisible-step drop-off closed; fresh operator completes first-server in one session.
7. **Data integrity:** S3 backups restore and download; `config_files` applied; install queue survives restarts; cumulative limits enforced; 2FA recovery codes usable; console logs persist to disk.
8. Mobile incident ≤3 thumb taps; 10k-file directory usable; WS backgrounded ≈ silent.
9. **API parity:** subusers have client-API access; startup + websocket-token endpoints live; advertised routes == registered routes.
10. **Daemon:** `/container/restart`, `/fs/mkdir`, `/fs/bulk-rm`, key rotation, log history, compiled binary — all shipped, additive, version-matrix-documented.
11. Addon contract published; no addon ships its own modal/toast or inline JS.
12. A11y pass clean at P0/P1; results published with baselines, counter-metrics, and honest limitations. Egg import, categories, and mount restrictions shipped **or explicitly deferred with a reason in the registry** (E-1..E-3).

---

## 10. Document map

| Doc | Role |
|---|---|
| `docs/intent/PLAN.md` | **This plan** — execution layer, registry, gates, version matrix owner. |
| `airlink-vs-pterodactyl-gap-report.md` (workspace root) | **Parity audit source** — 23 findings, severity key, per-item evidence. Registry B/D/E items derive from it; intake re-verifies (A-13). |
| `daemon/` (workspace root) | **Second codebase** — all ⚙ items land here; daemon standards in §8. |
| `docs/intent/01-strategize.md` | The "why" — do not re-litigate. |
| `docs/intent/02-investigate.md` | Research program R-1..R-6 (instruments, ethics, timeline). |
| `docs/intent/03-blueprint*.md/html` | System map + fail points (addon contract, CSP, handshake). |
| `docs/intent/04-journey*.md/html` | The three flows; P-1..P-7 and S-2/S-4 designs. |
| `docs/intent/05-organize*.md/html` | Taxonomy + labeling; N-1..N-5. |
| `docs/intent/06-wireframe*.md/html` | Reference frames 1-7; visual truth for S, N, P items. |
| `docs/intent/07-articulate.md` | Voice + copy library; all new strings must pass it. |
| `docs/intent/08-evaluate.md` | Baseline audit + protection list. |
| `docs/intent/09-fortify.md` | Verified defects + state inventories (S, X items). |
| `docs/intent/10-include.md` | a11y remediation + test plan (C, V items). |
| `docs/intent/11-transpose.md` | Mobile adaptation specs (N-2, X-2/3/4). |
| `docs/intent/12-localize.md` | i18n readiness + test plan (C-3..C-6). |
| `docs/intent/13-measure.md` | GSM, funnels, A/B, telemetry (V items). |
| `docs/intent/14-specify.md` | Engineering handoff (items 1-11) + addon contract draft. |

---

*Plan status: Draft v2 — parity audit integrated; 5 claims confirmed + 1 refined in this pass; 18 pending Phase-0 re-verification. Owner: design + product. Next action: Phase 0 — V-1 instrumentation, parity intake, assumption-register verification, R-1 + R-7 kickoff.*
