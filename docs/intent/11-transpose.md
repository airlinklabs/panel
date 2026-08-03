# Intent · 11 · Transpose

> Cross-context audit of Airlink Panel: desktop vs. mobile web. The panel is a single responsive web app, so this is web→web transposition — but the interaction models genuinely differ (mouse+keyboard console at a desk vs. thumb-driven micro-sessions on a phone). The framing rule: **what would this feel like if it were designed for mobile first?**

---

## Context analysis matrix

| Dimension | Desktop (lg+) | Mobile (<lg) |
|---|---|---|
| **Input** | Mouse + keyboard, hover, Ctrl-K/Ctrl-S, precise targeting | Touch, one thumb, virtual keyboard (half screen), no hover, gestures |
| **Attention** | Focused, long sessions, "at work" (managing a server during ops) | Fragmented, micro-sessions: "is my server up?", "did the restart work?", "ping a player" |
| **Real estate** | Sidebar + sub-nav + detail panels; overview + detail simultaneously | One thing at a time; sequential disclosure; bottom nav |
| **Connectivity** | Reliable, on LAN often | Spotty/metered; WS console drains battery; daemon-down on mobile is common (user not at the machine) |
| **Environment** | Office/basement, quiet | Commute, cafe, in-game, one-handed, glare |
| **Session length** | 10–60 min, complex multi-step ops | 30s–5 min, check-and-act |
| **Implied model** | Operator workstation | Remote "is it okay / fix it now" companion |

---

## What the panel gets right (verified)

**1. The console was genuinely transposed, not reflowed.** `manage.ejs:80` (desktop, `hidden lg:block`) and `manage.ejs:241` (`#mobile-manage`, `lg:hidden`) are *separate layouts*: compact chrome, single-column 2×2 stat grid, a dedicated mobile terminal (`#mobile-terminal`, line 342), its own command input (`#mobile-input`, line 346), and a one-tap copy-IP button with check feedback (lines 325-330). The mobile console is a real re-conception: fewer stats, bigger terminal, one-thumb input. **This is the reference implementation for every other surface.**

**2. Bottom nav with "More" sheet** (`bottomNav.ejs`) matches mobile convention: first 4 items + More. `min-height:44px` targets, `inert` when closed, focus management. Correct pattern.

**3. Fluid token-based layouts** everywhere (`px-4 sm:px-8`, `grid-cols-1 md:grid-cols-2`), no fixed-width traps on content pages.

---

## Findings

### P1

**1. Sub-nav horizontal scroll on mobile — the worst transposition.**
`serverTemplate.ejs:94` renders the 11-item strip with `whitespace-nowrap` and horizontal scroll on mobile (`nav-link2` overflow). On a 360px phone, an operator scrolls sideways through 11 unlabeled-in-group destinations to reach, say, Backups. There is no mobile "More" equivalent for the server sub-nav (unlike the global nav). **The /organize grouped taxonomy fixes this** (Run/Data/Manage/Settings) — on mobile the groups become an accordion or a swipeable paged strip.

**2. Admin section is a discovery wall on mobile.**
The bottom "More" sheet lists admin links in one flat list (bottomNav.ejs:74-119) with no grouping/role distinction; combined with finding 1, a mobile admin has the worst of both. Group admin links under a labeled section in the sheet and/or surface via the desktop-only admin sidebar.

**3. Console micro-actions need thumb reach.**
Desktop power buttons live top-right (manage.ejs:103-122); on mobile the same buttons are in the header area — verify they're in the bottom 60% of the viewport (thumb zone). One-thumb reachability is a transposition requirement: **power, send, and copy-IP should be thumb-reachable; the mobile layout should place them below the fold midpoint.**

**4. WS battery/bandwidth behavior unmanaged on mobile.**
The mobile console keeps the same WS streams and stat updates as desktop. On a commute with metered data, an idling console burns the battery. **Recommendation:** on mobile, when the tab is backgrounded (visibilitychange) or the console is idle >60s with no input, throttle WS to a slow heartbeat and show "Live updates paused — tap to resume."

### P2

**5. Session continuity across contexts is not designed.**
The panel has no "continue on mobile" handoff. A desktop operator mid-troubleshoot who switches to their phone starts over (no deep link to the server). **Recommendation:** the dashboard/recents already exist; add a shareable URL to a server (`/server/:id`) with deep-link state (e.g., `/server/:id?view=console|files&path=...`) so mobile picks up where desktop left off. No auth jump needed — sessions are already cookie-based.

**6. Breadcrumb hierarchy on mobile.**
`breadcrumb.ejs` in the server pages: on mobile the breadcrumb collapses to "Servers / {name}" — verify it truncates long names and doesn't push the header. Use ellipsis + title.

**7. Tables → cards on mobile is inconsistent.**
Databases, schedules, subusers collapse to stacked cards (`grid-cols-1`) — good. But backups may still render as a table on narrow screens; audit for horizontal-scroll tables (acceptable if scrollable + keyboard-focusable, worse if clipped).

### P3

**8. Hover-only affordances.** Desktop hover reveals actions (e.g., row hover) that mobile can't trigger; verify every hover-revealed control has an always-visible or tap-reveal path (touch convention).
**9. Long text input** — the cron visual editor (schedules.ejs:231) is a genuinely mobile-friendly creation (toggles over typing); extend that pattern to other forms where mobile typing is painful.

---

## Priority mapping per context (major surfaces)

| Surface | Desktop primary | Mobile primary | Mobile hidden/on-demand | Mobile removed |
|---|---|---|---|---|
| **Console** | Terminal + stats + power, multi-panel | Status + thumb power + compact terminal + copy-IP | Logs tab, sftp details | Chart density (collapsed to 2×2) |
| **Files** | Tree + bulk bar + editor | Browse + single-file actions + rename | Bulk ops (keep — they're session-persistent) | — |
| **Backups/Schedules** | Table with inline actions | Stacked cards, one action per card | Advanced task config (cron visual stays) | — |
| **Admin** | Sidebar hub, full tables | **Currently: flat More list (weak)** | — | Dashboards/charts density |

**The rule: mobile never removes a capability, it re-prioritizes it.** The transposition test — a frustrated admin on a train wanting to restart a crashed server must do it in ≤3 thumb taps.

---

## Cross-device journey map (target)

| Moment | Where user switches | State to carry | Mechanism |
|---|---|---|---|
| Mid-troubleshoot | Desktop console → phone | Server ID + view | Deep link `/server/:id?view=console` |
| Notified crash | Phone → laptop | Server ID | Same deep link; sessions cookie-based |
| Install in progress | Desktop → phone | Install state | Dashboard install banner already server-side; verify WS state survives nav |

**Current state:** no explicit handoff exists; the dashboard's server list + session-persistent file selection (files.ejs sessionStorage) partially covers it. Recommend the deep-link pattern — it's low-cost and makes the panel feel continuous.

---

## Adaptation specs to land in /specify

1. **Mobile server sub-nav** = grouped (Run/Data/Manage/Settings) horizontal paged strip or bottom-sheet on the More pattern, replacing `serverTemplate.ejs:94` horizontal scroll.
2. **Thumb zone:** power + send + copy-IP in bottom 60% on mobile manage layout.
3. **WS throttle on mobile background/idle** with "tap to resume" affordance (ties to /fortify P2-12 network handling).
4. **Deep-link continuity:** `/server/:id?view=...&path=...`.
5. **Admin in More sheet:** labeled group, not a flat list.
6. **Hover-reveal audit:** every hover-only control gets a tap path.

## Handoff
- **/organize:** the grouped taxonomy is the prerequisite for 1 and 5.
- **/fortify:** WS throttle (P2) and deep-link state preservation pair with session-expiry work.
- **/include:** thumb zone + 44px targets overlap; mobile terminal input needs SR-announced lock states.
- **/journey:** the provision/incident flows should be re-run on mobile constraints (3-tap test).
- **/specify:** 1-6 are engineering-ready items.
