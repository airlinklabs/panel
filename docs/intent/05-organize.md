# Intent · 05 · Organize

> Information architecture audit and redesign of Airlink Panel's navigation, taxonomy, labeling, and search.
> Visual: `05-organize-ia.html`.

---

## 1. IA Assessment

### Current structure (from code)

**Admin sidebar** (desktop `template.ejs`): groups hardcoded as **Core** (Overview, Servers, Users), **Infrastructure** (Nodes, Locations, Activity, Images), **Extensions** (Addons, API Keys), **Configuration** (Settings) — plus `regularMenuItems`/`adminMenuItems` from `uiComponentStore` (Servers, Analytics, Databases, Mounts, and addon items).

**User sidebar** (`regularMenuItems`): Dashboard (Servers), Analytics, Databases, Mounts, + addon items.

**Per-server sub-nav** (`serverTemplate.ejs`): Console, Files, Players, Schedules, Worlds, Startup, Backups, Subusers, Databases, Settings, Admin — **11 items**, mobile = horizontal scroll, desktop = tabs.

**Mobile** (`bottomNav.ejs`): first 4 `regularMenuItems` + "More" sheet holding the rest + admin section + account/logout.

**Global**: Ctrl-K search overlay (`/api/search`: servers + server sub-pages + users/nodes for admins).

### What's working

- **Two-taxonomy separation is right.** Admin navigates by *infrastructure entity* (nodes, servers, users, images); owners navigate by *work surface* (dashboard, analytics). Different jobs, different organizing principles — and the current structure honors that.
- **Polyhierarchy is used correctly.** "Databases" and "Mounts" appear at admin level (manage the entity) *and* server level (manage this server's instance). Legitimate — the admin page is the catalog, the server page is the instance.
- **Global search is genuinely good.** Fuzzy, grouped, recent-searches, aliases — the known-item escape hatch every IA needs. Search log analysis (a method in this skill) is already partially done by the client-side `pageCatalog` + alias system.
- **Entity groups (Core/Infrastructure/Extensions/Configuration) are mutually exclusive.** No orphan risk: every admin entity has a home.

### What's broken

1. **The 11-item server sub-nav is past the scan limit.** 7-9 top-level items is the strain point (Passini/Arthur wayfinding); 11 items on mobile scroll horizontally = the operator can't see where they are or what exists. This is the *deepest work surface* and it fails the "Where can I go?" wayfinding question.
2. **Mobile buries critical admin actions in "More."** First 4 regular items win the bottom rail; for an admin, "More" hides the admin section entirely. Discovery asymmetry: desktop shows the full tree, mobile hides it behind one sheet. A first-time mobile admin cannot orient.
3. **"Overview" (admin) vs. "Dashboard" (user) — same job, two names.** Both are the home/state-at-a-glance surface. Minor, but it violates one-vocabulary.
4. **Menu system is data-driven but the groups are hardcoded.** `initializeDefaultUIComponents` seeds items; addons append. That's good extensibility — but the *section taxonomy* (Core/Infrastructure/Extensions/Configuration) is fixed in the template, so an addon can't slot into a meaningful group without special-casing. Addon items land in a generic bucket.
5. **Server sub-nav mixes actions and navigation.** "Settings" (a surface) sits next to "Admin" (admin's server actions). Mixed levels in one rail add cognitive load.

---

## 2. Proposed site map

```
Airlink Panel
├── HOME (role-aware)
│   ├── Admin: Overview — fleet health, stat cards, update check
│   └── Owner: Dashboard — server grid/folders, status + usage
├── SERVERS / SERVER (per-server workspace) ← the deep surface
│   ├── Run      — Console, Files
│   ├── Data     — Backups, Worlds, Players
│   ├── Manage   — Startup, Databases, Schedules, Subusers
│   └── Settings — Settings, Admin (role-gated)
├── FLEET (admin) — infra entities
│   ├── Core       — Servers, Users
│   ├── Infra      — Nodes, Locations, Images, Mounts
│   ├── Activity   — Activity, Analytics, Player Stats
│   └── Extend     — Addons, API Keys, Settings
└── ACCOUNT — Profile, Credentials, 2FA, Language, Login history
```

**Key structural changes proposed:**
- **Group the server sub-nav into 3-4 named groups** (Run / Data / Manage / Settings) with the group label shown on desktop and a sticky group-aware mobile picker. 11 flat items → 4 groups. This is the single highest-IA-impact change.
- **Rename admin home "Overview" → "Overview" stays, but unify the *labeling rule***: each role's home is named by what it does ("Overview" for fleet ops is fine; "Dashboard" for owners is fine) — the fix is not renaming but *consistency within a role*. Actually the cleaner move: keep both names, document them as the same IA slot "HOME" so future screens don't add a third.
- **Addon slots in the taxonomy.** Expose the section taxonomy as a UI-registration contract (`section: 'fleet'|'account'|'server-run'|'server-data'|'server-manage'|'server-settings'`) instead of a free-form bucket, so addons land in a meaningful group or a clearly-labeled "Extensions" tail.

---

## 3. Navigation specification

| Surface | Pattern | Rationale |
|---|---|---|
| Admin home | Hub (stat cards) → drill-down | Fleet state at a glance; the thesis |
| Owner home | Dashboard grid | State + resource usage per server |
| Server workspace | **Grouped local nav** (proposed) | 11 items → 4 groups; scan-safe |
| Admin sidebar | Global hierarchical (entity taxonomy) | Correct for infrastructure ops |
| Mobile | Bottom rail (4) + More sheet | Keep, but More must expose admin groups explicitly, not as an undifferentiated list |
| Search | Global Ctrl-K, known-item | Already strong; keep and extend (see §5) |

**Global/local relationship:** server workspace is a *contextual shell* that replaces global nav while inside a server (it already does — `serverTemplate.ejs` renders its own tabs). The fix is grouping inside that shell, not changing the shell's relationship to the global sidebar.

---

## 4. Taxonomy documentation

**Admin entity taxonomy** (mutually exclusive, collectively exhaustive):
- **Core** — the two primary entities: Servers, Users.
- **Infrastructure** — the supporting entities: Nodes, Locations, Images, Mounts.
- **Activity** — the observation surfaces: Activity log, Analytics, Player Stats.
- **Extend** — the integration surfaces: Addons, API Keys, Settings.

Rule: an entity has exactly one home in the admin tree. Cross-links (e.g., a server's node) are contextual navigation *within* a page, not duplicate nav entries.

**Per-server taxonomy** (proposed grouping):
- **Run** — Console, Files. *(the day-to-day living surface)*
- **Data** — Backups, Worlds, Players. *(state that persists and can be restored)*
- **Manage** — Startup, Databases, Schedules, Subusers. *(configuration and governance)*
- **Settings** — Settings, Admin. *(the meta-surface; "Admin" = admin's server ops)*

**Scalability note:** the server group names are chosen so a new surface (e.g., "Schedules" already exists, a future "Plugins" or "Environment" tab) slots into a group without restructuring. Adding a surface = extending a group, not re-taxonomizing.

---

## 5. Labeling guide

**Approved labels (with rationale):**

| Label | Why it passes |
|---|---|
| Console | Destination-named; operators know it's the terminal |
| Files | Destination-named |
| Backups | Destination-named; restorable state |
| Worlds | Domain term players/owners use |
| Players | Clear |
| Startup | Domain term; names the destination |
| Schedules | Clear |
| Subusers | Names the entity and the access model |
| Databases, Mounts | Entity terms, correct for both levels |
| Overview (admin) | Fleet state at a glance |
| Dashboard (owner) | Personal server grid |

**Labels to avoid / change:**
- Avoid "Resources," "Library," "Hub," "Tools" — container words, not destinations. (None currently; guard future addons from adding them.)
- The server "More" sheet currently has no name — if it stays, label it with the item count ("More · 7") so users know something exists behind it.

**Naming convention for new items:** name the destination or the entity, never the category container. If a label fails a 5-second test ("what's under this?"), rename it.

---

## 6. Search & browse strategy

- **Search (known-item):** the existing Ctrl-K surface is the reference. Extend it to index *per-server pages by group name* ("files," "backups") — the client `pageCatalog` already does most of this.
- **Browse (exploratory):** the grouped server nav becomes the browse entry. A new owner who doesn't know what "Schedules" is can see it under "Manage" alongside Startup/Subusers and infer.
- **Zero-results recovery:** search currently returns grouped results; ensure a true zero-state ("No results for X — try a server name, page name, or node") with suggestions, not a bare empty panel.
- **Search-log → IA loop:** if operators keep searching for a page that *should* be browsable (e.g., "restart" → they want the power action, or "logs" → they want the console), that's an IA gap signal. Feed /investigate Q3.

---

## 7. IA test plan

1. **Tree test** (50+ operators) on the proposed grouped server nav: "Where would you find where the world file is saved?" → expect Backups/Worlds. "Where do you invite a friend to help run the server?" → expect Subusers under Manage. Success = >70% direct first-click.
2. **First-click test** on mobile: does an admin find Nodes without expanding More? Does a new owner find Files?
3. **Open card sort** (15+ operators) on the 11 server surfaces — *before* committing to Run/Data/Manage/Settings, validate that operators actually group them this way. This is the honest check: the proposed groups are a hypothesis, not a finding.

## 8. Pending questions

- Are the server surfaces *technically* groupable today, or is the sub-nav a flat list in `serverTemplate.ejs`? *(Engineering check; /specify confirms.)*
- Do addon `addServerMenuItem` items declare a group? If not, the taxonomy needs a default ("Extensions") and a migration path. *(Contract check; /blueprint + /specify.)*
- Should the mobile "More" sheet mirror the admin group taxonomy explicitly? *(Design decision for /wireframe and /transpose.)*
