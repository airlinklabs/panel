# Intent · 09 · Fortify

> Harden Airlink Panel for real-world use: every state outside the happy path. Method: state inventory per surface, edge-case catalog by stress category, first-run assessment, and resilience recommendations. Where the /evaluate pass flagged "unverified," those findings are resolved here with file evidence.

---

## Verified findings (resolves /evaluate's unverified flags)

**1. File editor has NO unsaved-changes guard — CONFIRMED, data-loss risk.**
`views/user/server/file.ejs:368-414` has save logic (button + Ctrl/Cmd-S) but no `beforeunload` handler, no dirty flag, no "leave with unsaved changes" prompt. Contrast: `files.ejs:737` and `worlds.ejs:165` *do* register `beforeunload`. An operator who edits a long config (server.properties, .env, spigot.yml) and clicks away silently loses work.
**Severity: P0.** This is the single clearest data-loss path in the product.

**2. Crash reason is not surfaced — CONFIRMED.**
`views/user/server/manage.ejs:1337-1352` collapses both `stopped` and `killed` to "Server stopped". A crash and a deliberate stop are indistinguishable on the status card. The last-known exit reason lives only in logs, which the operator must know to open. Diagnosis is the incident flow's weakest step (see /evaluate cognitive walkthrough).
**Severity: P1.**

**3. Power controls — verified healthy.**
`src/modules/user/server/console.ts:254-353` handles stop with a `stopping` cache flag and timeout guard (avoids stuck "stopping" state), restart is resilient to "already stopped" (console.ts:337), suspended/maintenance servers reject restart (console.ts:407-432). Schedules allow `kill` (schedules.ts:11,298). This is good recovery design — the kill/stop distinction is preserved, but see P2-1.

---

## State inventory

### Console (manage.ejs) — the stress-test reference surface

| State | What user sees | What they can do | Recovery |
|---|---|---|---|
| **Default** | Terminal, status card, stat charts, power controls | Type commands, send input, power controls | — |
| **Loading** | Skeleton, `lockInput('Waiting for container...')` placeholder (manage.ejs:794) | Wait | Timeout → offline banner |
| **Daemon offline** | Status card shows error line, offline banner after sustained WS failures (manage.ejs:509) + Retry | Retry | Retry or address daemon |
| **Stopping** | "Stopping server" lifecycle label, input locked | Wait; no cancel | Timeout guard (console.ts:264-283) auto-clears after failure, status returns to `offline`/`running` |
| **Stopped (user)** | "Server stopped", power → Start | Start | — |
| **Stopped (crash/killed)** | **"Server stopped" — same as user stop. Indistinguishable.** | Start | **Need exit-reason surfacing** |
| **Suspended** | Suspended state; start/restart rejected server-side (console.ts:229-254) | Open billing/contact admin | Surface "why" in UI before the 403 |
| **Reinstall / install-in-progress** | Lifecycle label with step layers ("Pulling image" → "Starting server") | Wait | Label has a **dead-end risk**: if an image pull stalls, no elapsed time, no progress %, no timeout indicator |

### Files (files.ejs + file.ejs)

| State | Current | Gap |
|---|---|---|
| **Empty dir** | Dir list empty state present | Confirm it guides (see /articulate empty-state library) |
| **Daemon offline** | Banner: "File management is unavailable" (files.ejs:147) | ✅ good — with restore hint? |
| **Bulk selection** | Session-persistent, floating bar, numbered confirm on delete (files.ejs:595) | ✅ reference pattern |
| **Overflow (large trees)** | No pagination/virtualization (P2 in /evaluate) | Pagination component |
| **Editor unsaved** | **No guard** | **P0: beforeunload + explicit dirty state** |
| **Save failure** | Toast "Failed to save file" (file.ejs:395) | Keep content in editor; retry inline — ✅ content not cleared, good |

### Backups / Schedules / Subusers / Databases

| State | Current | Gap |
|---|---|---|
| **Confirm fallback** | `window.modal` fallback → native `confirm()` (schedules.ejs:750-766, subusers.ejs:346-355) | a11y + consistency — /include P1; also, a native `confirm` mid-`Promise` resolves via callback — works, but blocks SR |
| **Deleted data (backups)** | Double-confirm on delete | ✅ |
| **Empty schedules** | Empty state | Verify guidance exists |
| **Long-running backup** | Progress | Verify there's a determinate indicator; if only a spinner, add elapsed/task state |

### Provision (nodes/installs) — first-run

Current flow (from /journey + /blueprint): create node → **out-of-band daemon config step** → install → install banner with named steps. See First-Run below.

---

## Edge case catalog (stress categories)

### Content stress
- **Long names/UIDs:** server names, file names, world names — verify truncation has `title` tooltip + no layout break. Terminal lines overflow horizontally — confirm scroll vs wrap is handled.
- **Unicode paths:** file routes use `encodeURIComponent` (file.ejs:196) — ✅. RTL file names must not break layout (Chinese/Japanese/South Asian lang.json present; content can be any script).
- **Empty content:** empty editor, empty file, blank command → validate before POST; send feedback.

### Volume stress
- **10,000-file directory:** file list without pagination will DOM-crush and block console input. **P1 for large servers.**
- **Hundreds of schedules/backups:** tables need the shared pagination component.
- **Real-time list churn** (players online/offline, WS status): must not re-render the whole list or lose scroll position (background-refresh pattern).

### Time stress
- **Slow API (5–30s):** installs and image pulls need graduated messaging (see /evaluate P2; /fortify's own recommendation). Stuck at "Pulling image" with no movement = Missing Feedback.
- **Session expiry mid-flow:** a long console session or a half-finished install when the session expires — verify the panel surfaces "session expired, please refresh" instead of silently failing POSTs.
- **Double-submit:** verify all save/create buttons disable on submit (file.ejs:371 ✅; check the others — schedules saveTasks, subuser add, db add). Risk of duplicate rows on double-click.

### Network stress
- **Daemon down mid-console:** WS `online-check` + offline banner exist (manage.ejs:509). ✅ Verify console input is disabled rather than queued-and-lost.
- **Panel API down:** verify fetch failures show an error state, not silent unhandled promise.
- **Hotel/2G:** SPA-ish fetches; ensure skeleton + cached server list on dashboard (stale-while-revalidate) rather than blank.

### Device stress
- **320px:** bottom-nav More sheet hides admin (see /transpose).
- **Zoom 200%:** verify no fixed-width layout traps; text uses fluid tokens (token-law ✅).
- **5-year-old phone:** heavy console re-renders — debounce WS status updates.

### User behavior stress
- **Back button mid-flow:** file nav → back; install → back; verify browser back doesn't break the console (URL-hash-based tabs).
- **Two tabs:** two console tabs to the same server — both get the WS stream; verify input isn't double-sent; confirm single-session guard or accept.
- **Walk-away during install:** the banner is the only signal; add "backgrounded" note so returning users can find install state on dashboard.
- **Paste of long text into console:** input must not flood/kill the WS send.

---

## First-Run Experience Assessment

**Current first-run:** sign up → create server (provision form) → **panel hands you a node config for an out-of-band daemon step** → install banner. The invisible-step problem (/evaluate P1-4) is the core fragility: the operator's first honest milestone ("my server is up") requires a step the panel shows *after* the node row exists, described as "Configure."

**Recommendations:**
1. **Value-first before config:** after creating the node, show an in-panel step-by-step with a copy-able config + a "I've done this" verification that pings the daemon — progress felt inside the panel.
2. **Progressive, not tour:** one guided step, not a 5-slide walkthrough. Show the sample config, let them copy, verify.
3. **Sample data:** for brand-new installs, offer a one-click "Install a starter server" so the dashboard is never an empty void (files, worlds, one schedule pre-populated).
4. **Install banner hardening:** add elapsed time, active layer, and a "still working" heartbeat after 30s; after 120s offer "you can wait or open a ticket — we'll email" (graduated messaging, /evaluate P2).

---

## Resilience recommendations (prioritized)

### P0 — Fix now
| # | Item | Where | Design |
|---|---|---|---|
| 1 | **Editor unsaved-changes guard** | file.ejs:368-414 | Add dirty flag on editor change + `beforeunload` prompt ("You have unsaved changes. Leave anyway?") + Cancel-first inline confirm on nav-back. Never clear editor content on save failure. |

### P1 — Next release
| # | Item | Where | Design |
|---|---|---|---|
| 2 | **Crash-reason surfacing** | manage.ejs:1331-1352 | Status card distinguishes crash: "Server crashed (exit code 137 — likely OOM). Open logs" with a link to the log tab. Daemon must send exit-reason; if unavailable, show "Stopped unexpectedly — open logs to see why." |
| 3 | **Stuck-install heartbeat** | manage.ejs lifecycle labels | After 30s without layer change: "Still installing — image pulls can take a few minutes." After 120s: offer background/notify option. |
| 4 | **Suspended why-now messaging** | console.ts:229-254 + manage.ejs | Before rejection, surface "This server is suspended. Contact your administrator." server-side message must reach the UI (check 403 body plumbing). |
| 5 | **Double-submit guard everywhere** | all create/save buttons | Standardize `btn.disabled = true` during in-flight (file.ejs:371 is the reference). |
| 6 | **Daemon-offline console input lock** | manage.ejs console | Disable send when offline banner is up; on reconnect, clear the placeholder lock (already handled via `lockInput`, verify unlock path). |

### P2 — Debt
| # | Item | Where | Design |
|---|---|---|---|
| 7 | **File pagination / virtualization** | files.ejs | >500 entries → paged or virtualized with count in list header. |
| 8 | **Pagination component** | all tables | Shared `al-pagination` (see /organize). |
| 9 | **Stale-while-revalidate dashboard** | dashboard.ts:209 + dashboard.ejs | Show cached statuses immediately; background-refresh; "N servers updated" indicator instead of full reload. |
| 10 | **Session-expiry surfacing** | global fetch | Intercept 401 → "Session expired — refresh to continue" with a refresh action, before the user thinks their action failed. |
| 11 | **Long-name truncation sweep** | lists/tables/cards | CSS ellipsis + `title` attr; verify no layout shift at 200% zoom. |
| 12 | **Two-tab console guard** | manage.ejs WS | On second socket, either hand off or warn; never double-send input. |

### P3 — Polish
| # | Item |
|---|---|
| 13 | Pasted long text → console: clamp + confirm send. |
| 14 | Backup/restore progress as determinate bar with elapsed time. |
| 15 | Empty-state for schedules/databases/backups with a one-click first-create (guide, not void). |
| 16 | Real-time list churn (players) → diff-in-place, preserve scroll. |

---

## Stress test results (sampled)

| Scenario | Result |
|---|---|
| Edit config → navigate away | **FAIL (P0)** — work lost silently |
| Crash vs. deliberate stop | **FAIL (P1)** — indistinguishable |
| Image pull stalls 5 min | **FAIL (P1)** — silent "Pulling image", no heartbeat |
| Daemon dies mid-console | **PASS** — offline banner + retry + input lock |
| Delete server twice | **PASS** — double-confirm + force-delete escape hatch (createServer.ts:361) |
| Stop gets stuck | **PASS** — stopping-flag timeout guard (console.ts:264) |
| Restart already-stopped | **PASS** — graceful (console.ts:337) |
| Suspended server power action | **PARTIAL** — rejected correctly, message may not reach UI |
| Session expires mid-flow | **UNVERIFIED** — needs 401 interception |
| Double-click Save | **PARTIAL** — file.ejs guards; others unverified |
| 10,000-file directory | **FAIL (P2)** — no pagination |
| RTL / CJK filename | **UNVERIFIED** — needs a script-mix pass (see /localize) |

---

## Handoff

- **/specify:** P0-1 and P1-2..6 are engineering-ready items with exact file targets.
- **/include:** alert() fallback (schedules.ejs:750, subusers.ejs:346) and input-lock SR announcements.
- **/journey:** crash-diagnosis and install-failure loops now have concrete state designs to fold into the flows.
- **/blueprint:** two-tab WS and session-expiry are system-level; confirm daemon sends exit-reason + a `lastExitCode` field for P1-2.
