# Airlink Panel — UI Port: Working Instructions

> **Who this is for.** An agent (human or model) assigned one page — or one
> batch of pages — of the peak-UI port. Read §0–§8 before you touch anything.
> §10 is your assignment. Everything else is reference you look up as needed.
>
> **Repo:** `/home/tmz/repos/airlink/panel` (run every command from here)
> **Design authority:** `/home/tmz/repos/airlink/ref/panel` @ `fb4059b2e7cf8398a725a1ff794164948b2d5052`
> **Style of this port:** *refinement*, not redesign. The old panel's layout,
> density and structure are the target. Current tokens are the paint.

---

## 0. Read this first (60 seconds)

The loop you will run, per page, is exactly this:

1. **Screenshot** the page — desktop dark **and** mobile dark.
2. **Analyse** the full-page picture against §2 (old panel) + §3 (components).
3. **Fix** everything you found, page-level first.
4. **Click into each component** on that page: screenshot it close up / at both
   viewports, analyse it, fix it. Add genuinely missing components to the
   component library (§3.4) rather than styling them inline in the page.
5. **Confirm all components on the page are accounted for** — walk the DOM
   checklist (§6.4). Nothing unclassified.
6. **Verify** (§8). Then and only then, move to the next page.

Mobile is **not** a follow-up. Every screenshot round includes the 390×844
capture. If a fix is viewport-specific, you capture both to prove it.

**Never** start a second page while the current one is unverified.

---

## 1. Mission & hard boundaries

### In scope
- `views/**` — EJS views, partials, layouts
- `views/styles/**` — the CSS (and `views/styles/main.css` imports)
- `storage/lang/en/lang.json` — translation catalog (live catalog)
- `storage/themes/builtin/{default-light,default-dark}.css` — token values
- `public/javascript/**` — UI JS (only where a UI affordance needs it)
- `public/fonts/**`, `public/assets/auth/**` — self-hosted assets
- **Backend (`src/**`) is off-limits with ONE exception:** wiring/keys for
  i18n. Nothing else. If a page "needs" a backend change to look right, you
  document it in your report and move on.

### Out of scope — never do these
- Do not "fix" logic, routes, queries, permissions, validation, error codes.
- Do not rename or delete anything in `src/i18n`, `locales/`, `lingui.config.ts`,
  or `tests/i18n/**`. There are **two** i18n systems; the lingui one is
  dead-but-tested. `tests/i18n/lingui.test.ts` imports it. Leave it alone.
- Do not delete `storage/lang/*/lang.json` keys, or reorder non-English
  catalogs' structure.
- Do not add dependencies.
- Do not commit. All work stays uncommitted in the working tree until the
  human reviews.
- Do not create files under `views/` root or `src/` for anything UI-related.

### Quality bar
`impeccable` skill rules apply: **bounded verification, not open-ended QA.**
One batched screenshot round (desktop + mobile together) → fix everything it
shows in one batch → at most **one** confirm round → stop. Do not loop.

Run these once when you start, and do not re-run them:
```sh
~/.agents/skills/impeccable/scripts/impeccable context   # cwd = this repo
```
Then read `~/.agents/skills/impeccable/reference/craft-floor.md` immediately
before your first UI edit, and keep it loaded while editing.

There is **no PRODUCT.md / DESIGN.md** in this repo. That was already decided:
the incumbent visual system is the authority (`SCOPED_EXISTING_ALLOWED`). Do
not run `init`. The *old repo* (§2) is the structural authority for this port.

---

## 2. Design authority — the old panel

`/home/tmz/repos/airlink/ref/panel` is checked out at the target commit. When
you are unsure what a page should look like, **open the matching old view and
read it.** Do not guess.

```sh
ls /home/tmz/repos/airlink/ref/panel/views/
sed -n '1,200p' /home/tmz/repos/airlink/ref/panel/views/user/dashboard.ejs
```

Old views live under `views/{user,admin,components,auth}/`. They are plain
Tailwind; they have no component layer. Translate their *structure and rhythm*,
not their class strings.

### The old vocabulary (translate these)

| Old construct | Meaning | Port to |
|---|---|---|
| `w-60` sidebar, `lg:w-56` variant | fixed nav column | keep `.user-sidebar` / `.admin-sidebar` as-is |
| topbar `h-16` | 64px chrome strip | `.al-topbar` |
| `sm:flex sm:items-center px-8 pt-4` + `h1 text-base font-medium leading-6` | page header | `.al-page-header` + `.al-page-title` |
| `p mt-1 tracking-tight text-sm text-neutral-500` | page description | `.al-page-desc` |
| `rounded-xl border shadow` card | card | `.al-card` |
| `bg-gray-50 dark:bg-neutral-700/30 px-5 py-3` card footer strip | card footer | `.al-card-footer` |
| `grid sm:grid-cols-2 lg:grid-cols-3 gap-4` | card grid | same, `gap-4` |
| status chip `px-2.5 py-1 text-xs font-medium rounded-md` + border | state badge | `.al-badge-online` / `-offline` / `-warning` |
| `animate-ping` + solid dot | live dot | `.al-dot-online.al-dot-ping` |
| `bg-blue-600 hover:bg-blue-700` | primary action | `.al-btn-primary` (already blue-600) |
| `rounded-xl bg-amber-100 dark:bg-amber-800/10 px-4 py-6` + icon + `<h3>` + `<p>` | page notice | `.al-alert-warning` + `.al-alert-title` / `.al-alert-body` |
| `text-sm text-gray-500` label / chip value on the right | stat row | see §3.6 |
| segmented `bg-gray-100 dark:bg-neutral-800 p-1 rounded-lg` toggle | view switch | `.al-segmented` (§13) |
| `text-blue-500 hover:underline` inline action | link button | `.al-btn-link` or `.al-btn-ghost` |
| table `shadow ring-1 rounded-lg` + `thead bg-gray-50` | table block | `.al-table-wrapper` |

### Deliberate deviations from the old panel (do not "correct" these)
- **Tokens are the current `--theme-*` system**, not hardcoded `gray-*` /
  `blue-*`. Never write a raw hex or a `gray-700` in a view.
- **Font is self-hosted General Sans** (`public/fonts/general-sans.css`),
  Inter Variable as fallback. The old panel loaded it from a CDN; ours cannot
  (CSP `fontSrc: ['self','data:']`).
- **A desktop topbar was added** (old had a dead `#searchButton` with no
  handler and no light/dark switch). Keep it.
- **No sidebar-collapse toggle** (old's was dead code).
- **Theme toggle is client-side `localStorage`** (`window.alTheme`), never
  persisted to backend.

---

## 3. The design system

### 3.1 Token layer — the only source of colour

Every colour comes from a `--theme-*` custom property. Both themes are loaded
on every page (`default-light.css`, `default-dark.css`) and selected by the
`html.dark` class.

```css
/* NEVER */
style="color:#f87171"      class="text-gray-400"     bg-blue-600
/* ALWAYS */
style="color:var(--theme-danger)"   class="..." style="background:var(--theme-primary)"
```

The tokens you will use constantly:

| Group | Tokens |
|---|---|
| Surfaces | `--theme-bg` `--theme-bg-card` `--theme-bg-secondary` `--theme-bg-hover` `--theme-bg-input` `--theme-bg-active-nav` |
| Text | `--theme-text` `--theme-text-strong` `--theme-text-muted` `--theme-text-faint` `--theme-text-placeholder` `--theme-text-link` |
| Lines | `--theme-border` `--theme-border-subtle` `--theme-border-strong` `--theme-border-input` `--theme-border-accent` |
| Brand | `--theme-primary` `--theme-accent` `--theme-text-on-accent` |
| Semantic | `--theme-success` `-bg` · `--theme-danger` `-bg` · `--theme-warning` `-bg` · `--theme-info` `-bg` |
| Nav | `--theme-nav-bg` `--theme-nav-border` `--theme-nav-text` `--theme-nav-text-active` `--theme-nav-icon` `--theme-nav-icon-active` |
| Depth | `--theme-shadow-sm/md/lg/xl` `--theme-toggle-bg` `--theme-logo-bg` |
| Table | `--theme-table-header-bg` `--theme-table-row-hover` `--theme-table-divide` |

If you need a colour that has no token, **add the token to both theme files**
and use it. Do not inline a value in a view.

### 3.2 Typography

- Display/body face: **General Sans** — already wired in `layouts/base.ejs`.
  Never set `font-family` in a view.
- Scale (already enforced by `.al-page-title`, `.al-section-title`, etc.):
  page title `16px/24px medium` · section title `15px semibold` ·
  card title `14px semibold` · body `14px` · label `13px/500` ·
  caption `12px` · micro-label `10px/500 uppercase` only for table/stat labels.
- Tracking: `-0.01em` to `-0.025em` on headings via `tracking-tight`. Floor is
  `-0.04em` — never tighter.
- **No kickers/eyebrows above headings.** (craft-floor hard ban.)
- Numerals in tables and stats: `font-mono` with `font-variant-numeric:
  tabular-nums` (`.al-table` already does this).

### 3.3 Geometry

Fixed by the component layer — **do not restate it in views:**

| Thing | Value |
|---|---|
| Card radius | `0.75rem` (12px) |
| Button radius | `0.75rem`, sm `0.625rem` |
| Input radius | `var(--theme-radius-input)` |
| Badge radius | `0.375rem` (6px) — chips, **never** pills |
| Card padding | `1.25rem` (`--al-card-pad`) |
| Page gutter | `px-6` mobile / `px-8` ≥640 |
| Hairline | `1px solid var(--theme-border)` |
| Elevation | **either** border **or** shadow, not both. `.al-card` sets a 1px border *and* a soft shadow — that is the committed look, keep it. |
| Focus ring | `reset.css` → `--theme-primary`. Do not override with `focus:ring-*`. |

### 3.4 Component class dictionary

**Before writing any markup, grep for the class you think you need:**
```sh
grep -rn "\.al-page-header" views/styles/
grep -rln "al-badge-online" views/
```
If it exists, use it. If it does not exist and you need it, **add it to the
component layer** (§4.1) and document it here.

#### Page structure — `views/styles/pages/page-layout.css`
| Class | What it does |
|---|---|
| `.al-page-header` | Header row. Child 1 = title column; child 2 (only if present) = action column, right-aligned on ≥640, stacked below on mobile. `px-6 pt-5 pb-3 sm:px-8` |
| `.al-page-title` | `16px/24px medium`, `--theme-text-strong` |
| `.al-page-desc` | `14px mt-1`, `--theme-text-muted` |
| `.al-page-body` | `px-6 sm:px-8 pb-8` — put content here |
| `.al-page-crumbs` | `px-6 pt-4 sm:px-8` — breadcrumb strip above the header |
| `.al-section` / `.al-section-head` / `.al-section-title` / `.al-section-desc` | titled block without a nested card |
| `.al-section-label` | `10px uppercase tracking-widest` group label |
| `.al-stat-grid` | `grid 1 / md:2 / lg:4` for metric cards |

#### Cards — `views/styles/components/card.css`
| Class | What it does |
|---|---|
| `.al-card` | default surface, pad `1.25rem`, r12, hairline, `shadow-lg` |
| `.al-card-flush` | pad `0` — for tables, media, code, list rows |
| `.al-card-lg` | pad `2rem` — centred/hero forms |
| `.al-card-accent` | border in `--theme-primary` |
| `.al-card-header` | top strip, `--theme-bg-secondary`, title + actions |
| `.al-card-title` / `.al-card-subtitle` | header text |
| `.al-card-header-actions` | right side of a header |
| `.al-card-body` | content under a header |
| `.al-card-footer` | bottom strip, `--theme-bg-secondary` |
| `a.al-card` | whole card is a link: `transition-colors`, hover raises border + shadow |

> **Rule:** the card sets its own padding. Never put `p-4` / `px-6` on a card.
> Pick `.al-card`, `.al-card-flush`, or `.al-card-lg` instead. (Utility classes
> now outrank the component layer, so a stray `p-4` silently defeats the card.)

#### Buttons — `views/styles/components/button.css` + `views/partials/ui/button.ejs`
Variants: `.al-btn-primary` `· -secondary` `· -danger` `· -danger-outline`
`· -success` `· -ghost` `· -link`
Sizes: `.al-btn-sm` `12px` · default `14px` · `.al-btn-lg` `15px`
Also: `.al-btn-group` (joined segments), `.al-btn-icon-only` (square).

Preferred: use the partial, it handles variant→class, `aria-disabled` on
anchors, and the `icon()` name clash.
```ejs
<%- include('../partials/ui/button', {
  type: 'submit', label: t('save'), variant: 'primary', size: 'md',
  cls: 'w-full', icon: icon('save', { class: 'size-4' }), iconPosition: 'left'
}) %>
```
Anchors: pass `href`. Never add `inline-flex items-center gap-*` on `.al-btn` —
the component already supplies display/gap and the utilities now win.

#### Badges & dots — `views/styles/components/badge.css`
`.al-badge` base · `.al-badge-online|offline|warning|info|neutral` ·
`.al-badge-solid` (no tint, for dense tables)
`.al-dot` `·-online` `·-offline` `·-warning` `·-info` (8px) ·
`.al-dot-ping` adds the live pulse (only for genuinely live states — a pulse on
a dead server is a lie).

#### Fields — `views/styles/components/field.css` + `views/partials/ui/form-field.ejs`
`.al-form-field` (column, 6px gap) · `.al-form-label` · `.al-form-input` ·
`.al-form-select` · `.al-form-textarea` · `.al-form-checkbox` · `.al-form-radio` ·
`.al-form-help` · `.al-form-error` · `.al-required` · `.al-field-invalid` ·
`.al-field-success`

```ejs
<%- include('../partials/ui/form-field', {
  type: 'text', name: 'email', label: t('fieldEmail'), id: 'email',
  required: true, helpText: t('emailHelp'), error: t('emailInvalid'),
  options: [{ value:'a', label:'A', selected:true }]
}) %>
```
The partial wires `aria-describedby` / `aria-invalid` / `aria-required`
automatically. **Never** hand-roll a `<label><input>` pair.

#### Tables — `views/styles/components/table.css` + `views/partials/ui/table.ejs`
`.al-table-wrapper` (scroll + r12 + ring) · `.al-table` · `.al-table-thead` ·
`.al-table-tbody` · `.al-table-tr` · `.al-table-th` · `.al-table-td` ·
`.al-table-card` (mobile stacked) · `.al-table-sticky` · `.al-table-compact` ·
`.al-table-empty` · `.col-hide` (hidden below `lg`)

```ejs
<%- include('../partials/ui/table', {
  id: 'users', columns: [{ header: t('username'), key: 'username' }],
  rows: users, emptyState: t('noUsers')
}) %>
```

#### Notices — `views/styles/components/toast.css`
`.al-alert-danger|warning|success|info` — `flex items-start gap-2.5`, tinted
background, hairline. Children:
- `.al-alert-title` — bold first line
- `.al-alert-body` — supporting line

Old anatomy: `rounded-xl` box, icon, `<h3>` title, `<p>` body. Match that.

#### Topbar — `views/styles/components/topbar.css`
`.al-topbar` · `.al-topbar-search` · `.al-kbd` ·
`.al-theme-switch` (`role="switch"`, `aria-checked`) ·
`.al-theme-switch-track` · `.al-theme-switch-thumb`

#### Auth — `views/styles/pages/auth.css`
`.al-auth` (split shell) · `.al-auth-form` · `.al-auth-visual` ·
`.al-auth-logo` · `.al-auth-title` · `.al-auth-subtitle` ·
`.al-auth-error` (+ `.al-auth-notice--success`) · `.al-auth-error-title` ·
`.al-auth-error-body` · `.al-pw-criteria` (+ `li[data-met]`)

#### Other
`.al-breadcrumb` · `.al-state-panel` / `.al-state-icon` / `.al-skeleton` ·
`.al-sheet-*` (bottom sheet / overlay) · `.al-modal-overlay` / `.al-dialog*` ·
`.al-toggle-track` / `.al-toggle-dot` · `.al-radio-*` · `.al-action-*` (loading /
success / error button states) · `.al-tabs`-family `.tab-btn` ·
`.al-pagination` · `.al-surface` / `.al-surface-raised` ·
`.al-text-muted` / `.al-text-strong`

#### Added by Batch 0 & Batch 4 — **reuse these before inventing anything**
Every file below is already registered in `main.css` and wrapped in
`@layer components`. Run `grep -rln "al-chip" views/` to see them in use.

| File | Classes | What it is |
|---|---|---|
| `components/button.css` | `.al-segmented` · `.al-segmented-btn` | The old panel's Grid/List view switch. `role="group"` track, each segment a `<button aria-pressed>`. Active segment gets `--theme-bg-card` + `--theme-text-strong` + `font-medium`. Use for **any** view-mode toggle. |
| `components/toast.css` | `.al-alert-title` · `.al-alert-body` | Children of `.al-alert-*` — bold first line + supporting line (the old notice anatomy). |
| `components/panel.css` | `.al-panel` · `.al-panel-head` | An inset sub-surface *inside* a card. Use when a card needs a visually recessed region — not another `.al-card`. |
| `components/progress.css` | `.al-progress` · `-lg` · `-fill` · `-success|-warning|-danger|-info|-accent` | Determinate meter. **No width transition** (layout-animation antipattern). |
| `components/icon-tile.css` | `.al-icon-tile` · `-sm|-lg` · `-round` · `-accent|-success|-warning|-info|-danger` | Square/disc rounded container for an icon or avatar initial. |
| `components/avatar.css` | `.al-avatar` · `-sm|-lg` · `-accent` | Circular initials disc (node/server owner). |
| `components/chip.css` | `.al-chip` · `-mono` · `-accent` · `-success|-danger|-warning` · `-remove` | Small inline value token — port, tag, version. `-remove` adds a dismiss affordance. |
| `components/code.css` | `.al-code` · `.al-code-wrap` | Monospaced preformatted block — commands, JSON, logs. |
| `components/form-card.css` | `.al-form-card` · `-title` · `-desc` | The surface for a *grouping* of form fields (create/edit pages). Header bleeds to the card edges. **Not** a substitute for `.al-card`. |
| `components/criteria.css` | `.al-criteria-mark` · `.al-criteria-done` · `.al-pw-criteria` | Requirement checklist marks (met / unmet, pending → warning). |
| `components/setting-row.css` | `.al-setting-row` · `.al-setting-copy` · `.al-setting-title` · `.al-setting-desc` · `.al-setting-control` | A labelled control inside a card (label + help left, control right). **Collapses to a column below `lg`** so a select never squeezes. This is what a settings page is made of. |
| `components/activity.css` | `.al-activity-group` · `-list` · `-item` · `-main` · `-title` · `-meta` · `-toggle` | The admin activity-log feed (icon + title + meta + disclosure). |

If you need one of these and it does not exist, it has not landed yet — grep
first, and only then create your own with a *new* name.

### 3.5 Which partial when

| Situation | Use |
|---|---|
| Page shell | never hand-write — layouts are `user.ejs` / `admin.ejs` |
| Page header | `.al-page-header` markup (do **not** use a partial; it is 6 lines) |
| Button | `partials/ui/button.ejs` |
| Card (static, with header/footer) | `partials/ui/card.ejs` |
| Card (link, custom body) | `<a class="al-card">` directly |
| Form control | `partials/ui/form-field.ejs` |
| Table | `partials/ui/table.ejs` |
| Breadcrumb | `partials/ui/breadcrumb.ejs` |
| Button row (joined) | `partials/ui/button-group.ejs` |
| Empty list | `partials/empty-state.ejs` |
| Row of stat cards | `.al-stat-grid` + `partials/stat-card.ejs` |
| Status chip | `partials/status-badge.ejs` (verify it matches `.al-badge-*` first) |
| Pagination | `partials/pagination.ejs` |

### 3.6 Common patterns

**Stat row (label left, value chip right) — the old panel's card body:**
```ejs
<dl class="mt-4 flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <dt class="text-sm" style="color:var(--theme-text-muted)"><%= t('ramUsage') %></dt>
    <dd class="al-badge al-badge-neutral font-mono tabular-nums"><%= ram %>%</dd>
  </div>
</dl>
```

**Card footer strip (status left, action right):**
```ejs
<div class="al-card-footer justify-between" style="background:var(--theme-bg-secondary)">
  <span class="flex items-center gap-2 text-sm" style="color:var(--theme-text-muted)">
    <span class="al-dot-online al-dot-ping"></span><%= t('online') %>
  </span>
  <span class="al-btn-link"><%= t('manage') %> →</span>
</div>
```
Note: when the whole card is already an `<a>`, a nested `<a>` is **invalid
HTML**. Render the inner action as a `<span aria-hidden="true">` — the parent
anchor already carries the accessible name.

---

## 4. File & code structure rules

### 4.1 CSS lives in the component layer
Every file under `views/styles/components/**` and `views/styles/pages/**`
**must** be wrapped in `@layer components { … }`, except
`views/styles/pages/motion.css` (deliberately unlayered so its reduced-motion
rules win).

Order of the layers is declared at the top of `views/styles/main.css`:
```css
@layer properties, theme, base, components, utilities;
```
Utilities are last = highest. **That means a stray `p-4` on an element that also
has a component class will override the component.** This is why the page sweep
exists (§6.3): find and remove per-view geometry utilities that fight the
component layer.

New CSS file? Register it with the locked helper — `main.css` is shared by
every parallel agent, so do not edit it by hand:
```sh
node .agents/css/import.mjs ./components/my-thing.css     # inserts once, in the components group
node .agents/css/import.mjs --list                        # see what is registered
```
The file must already exist, wrapped in `@layer components { … }`.
**Do not remove or reorder any existing import.**

### 4.2 Where things go
```
views/
  layouts/        base, user, admin, auth + their *-footer. Shell sandwich —
                  see §11, the opening/closing <div> counts must stay balanced.
  partials/       shared across sections (topbar, sidebars, bottom-nav, …)
  partials/ui/    the component library partials (button, form-field, table, …)
  fragments/      HTMX partials — MUST stay shell-free and keep their ids (§11)
  user/ admin/ auth/ errors/   pages
  styles/
    tokens/       raw token definitions
    base/         reset, typography, forms
    components/   one file per component, @layer components
    pages/        per-area layout (page-layout, auth, console, motion, …)
```

### 4.3 Icons
```ejs
<%- icon('server', { class: 'size-4' }) %>          <!-- server-side -->
alIcon('server', 'w-4 h-4')                         <!-- client-side -->
```
**No raw `<svg>` in views.** `tests/iconVocabulary.test.ts` fails otherwise
(brand marks are exempted in that test — do not add new exemptions).
`icon()` already emits `aria-hidden="true"`; pass `label:` only when the icon
is the sole content of a control.

### 4.4 Client JS
- Scripts must be nonce'd: `<script nonce="<%- nonce %>">`.
- Inline scripts may only reference element ids **defined in the same view**
  (`tests/elementIds.test.ts`).
- External UI JS goes in `public/javascript/shared/`, is referenced with
  `assetUrl('/javascript/shared/x.js')?v=N`, and should be re-versioned when
  edited.
- Translations on the client: `window.__i18n` is already populated in
  `layouts/base.ejs`.

### 4.5 Accessibility floor (non-negotiable)
- One `<h1>` per page, inside the page header.
- Landmarks: `<main>` for page content (already in `layouts/user.ejs`), skip
  link already in `base.ejs` — do not remove.
- Every control has an accessible name. Icon-only controls need `aria-label`.
- Focus visible everywhere (`reset.css` handles it — do not add `outline-none`).
- Touch targets ≥44px on mobile (`min-h-[44px]`).
- Live/dynamic regions: `role="alert" aria-live="assertive"` for errors,
  `aria-live="polite"` for toasts.
- Colour never carries meaning alone (pair with text or an icon).
- `prefers-reduced-motion` is handled centrally in `motion.css`; do not add
  per-view reduced-motion blocks.

---

## 5. Translations

**Live system:** `t()` / `tn()` from `src/services/i18n.ts`, backing store
`storage/lang/<locale>/lang.json` (flat, alphabetically sorted, ~2380 keys in `en`).

```ejs
<%= t('dashboard') %>
<%= t('errorAccountLocked', { wait: req.query.wait || 'a few' }) %>   <!-- {{wait}} -->
<%= tn('serverCount', servers.length) %>                              <!-- plural map -->
```

Rules:
1. **No raw user-facing English in a view.** No hardcoded page titles, tab
   labels, aria-labels, placeholder text, button text, empty-state copy, or JS
   strings that surface to the user.
2. **Never write `storage/lang/en/lang.json` by hand.** It is one sorted file
   shared by every parallel agent — use the locked helper:
   ```sh
   node .agents/i18n/add.mjs myNewKey "English value"
   node .agents/i18n/add.mjs --json '{"aKey":"A","bKey":"B"}'
   node .agents/i18n/add.mjs --get dashboard     # print value or null
   node .agents/i18n/add.mjs --has dashboard     # exit 0/1
   ```
   It takes an exclusive lock, merges, re-sorts, and renames into place.
   Idempotent — an existing key is never overwritten. New keys go in `en`
   only; every other locale falls back to `en`.
3. Key naming: `camelCase`, grouped by meaning — `errorTitle*` for a notice's
   bold line, plain `error*` for its body, `field*` for labels/placeholders,
   `nav*` for chrome.
   **One sanctioned exception:** `views/admin/activity/index.ejs` uses the key
   `'Activity Log'` (English phrase *as* the key, gettext-msgid style), because
   `tests/activityLogger.test.ts` renders with `t = (key) => key` and asserts
   the page contains `Activity Log`. Tests are off-limits, so the key carries
   the English. **Do not copy this pattern** anywhere else — if you hit the same
   wall, report it instead of inventing a space-key.
4. **Always `--has` before inventing a key:**
   ```sh
   node .agents/i18n/add.mjs --has welcomeBack || node .agents/i18n/add.mjs welcomeBack "Welcome back"
   ```
5. Interpolation is `{{name}}`, values passed as the 2nd arg.
6. After adding keys: the catalog is read once per language into a Map, so the
   **dev server must be restarted** (§7.1) for them to appear.
7. `render.mjs` prints `<<MISSING:key>>` markers — use that to catch gaps
   offline.
8. **Do not** migrate anything to lingui in this pass. That is a separate,
   explicitly-gated phase.

---

## 6. The page loop

Repeat for **every** page you are assigned. Do not batch pages together in one
edit session — one page, verified, then the next.

### 6.1 Round 0 — capture
```sh
sh .agents/ui-shots/restart.sh                       # after any .ejs edit
sh .agents/ui-shots/batch.sh /tmp/ui/<page> <route>
# → /tmp/ui/<page>/<route>_1440x900_dark.png
# → /tmp/ui/<page>/<route>_390x844_dark_m.png
```
If you changed something, `FULL=1` for pages taller than the viewport.

### 6.2 Round 1 — analyse the page as a whole
Read the screenshots (you can `read` the PNG directly) and answer:

- [ ] Does the **page header** match §2? (`al-page-header` + `al-page-title` +
      `al-page-desc` + action column) One `<h1>`?
- [ ] Is the content in `.al-page-body` with the standard gutters, or is it
      ad-hoc `px-4 sm:px-6 lg:px-8`?
- [ ] Are cards `.al-card*` with **no** competing padding utilities?
- [ ] Is every button an `.al-btn*` (or the button partial) with the right
      variant/size — no raw `px-3 py-2 rounded-lg bg-…`?
- [ ] Any raw colours? Any raw `<svg>`? Any hardcoded English?
- [ ] Table: `.al-table-wrapper` + sticky head, or a hand-rolled `<table>`?
- [ ] Empty state, loading state, error state present and using the shared
      partials/components?
- [ ] Density: does the old panel fit more/less on screen? Match it.
- [ ] Vertical rhythm: consistent 12/16/20/24/32 steps, no 13px or 17px gaps?
- [ ] Focus/hover: tab through and confirm every control shows the ring.
- [ ] Contrast: muted text on the actual card surface ≥4.5:1.

Write the findings down as a list **before** editing.

### 6.3 Fix — page level first
Apply the batch. While you are in here, also strip dead geometry utilities
that now fight the component layer:
```sh
grep -n 'class="[^"]*\bal-card\b[^"]*p-[0-9]' views/<page>.ejs   # cards
grep -n 'class="[^"]*\bal-btn\b[^"]*px-\|al-btn[^"]*py-' views/<page>.ejs  # buttons
grep -n 'class="[^"]*\bal-page-header\b[^"]*p[xy]-' views/<page>.ejs
grep -n 'text-gray-\|bg-gray-\|border-gray-\|blue-[0-9]\|slate-\|zinc-\|neutral-[0-9]' views/<page>.ejs
```
Then restart + recapture.

### 6.4 Round 2 — component by component
Now walk the **rendered** page and inventory every distinct visual element:

```sh
node .agents/ui-shots/diag2.mjs http://localhost:3000<route>
```
For each element class you find (card, badge, dot, button, field, table, tab,
toggle, chip, empty state, notice, avatar, progress, menu row…):
1. Grep the component library for it (§3.4).
2. If it exists → is the page using it correctly? Fix the page.
3. If it does not exist → **create it in the component layer** (its own
   `views/styles/components/<name>.css` in `@layer components`, `@import` in
   `main.css`, plus a `partials/ui/<name>.ejs` if it needs markup logic), then
   document it in §3.4 so the next agent finds it.
4. If it exists but is used inconsistently across pages you own → normalise.

**Exit condition for this step:** you can name every element on the page and
point at the class or partial that owns it. If you find yourself writing
one-off CSS inside the `.ejs` file (`<style>` blocks), stop — that is a missing
component.

**Deliverable — you must write this table in your report before moving on:**

```
| Element on page                | Owner (class / partial)         | Action     |
|--------------------------------|---------------------------------|------------|
| page header                    | .al-page-header (page-layout)   | rewrote    |
| server card                    | .al-card (card.css)             | rewrote    |
| status chip                    | .al-badge-online (badge.css)     | used as-is |
| RAM value chip                 | —                               | NEW: reuse .al-badge-neutral, no new class |
| card footer strip              | .al-card-footer (card.css)      | rewrote    |
| Grid/List switch               | —                               | NEW: .al-segmented → button.css |
```
Every row must end in `used as-is` / `rewrote` / `NEW`. A `—` in the Owner
column without a `NEW` row means you are not finished.

**Creating a component (when the row says NEW):**
1. `views/styles/components/<name>.css`, whole file inside `@layer components { }`.
2. `@import "./components/<name>.css";` in `views/styles/main.css` **before**
   `@import "tailwindcss";`.
3. Only add `partials/ui/<name>.ejs` if the markup needs logic (loops,
   conditionals, aria wiring). Otherwise a documented class is enough.
4. Use semantic tokens, never literals.
5. Add it to **§3.4** of this file — the next agent will look for it there.
6. Add a `grep`-able comment in the CSS saying which pages use it.

### 6.5 Round 3 — mobile
Recapture at 390×844 and check:
- [ ] No horizontal overflow → `node .agents/ui-shots/diag.mjs <url>` must report
      `scrollWidth === clientWidth`.
- [ ] Page header actions stack under the title (`.al-page-header` does this).
- [ ] Tables become `.al-table-card` or scroll inside `.al-table-wrapper`.
- [ ] Grids collapse to one column.
- [ ] All touch targets ≥44px.
- [ ] Nothing hides under the fixed 48px mobile top bar or the 52px bottom nav
      (`base.ejs` pads `#page-content` for both — do not defeat it).
- [ ] No truncated/clipped text at 390px.

### 6.6 Confirm — at most one more round
Recapture desktop + mobile together, confirm the batch is clean, **stop
polishing.** Then §8, then the next page.

---

## 7. Harness

Everything lives in `.agents/ui-shots/` (gitignored). Full recipes in
`.agents/ui-shots/README.md`.

### 7.1 Server
```sh
sh .agents/ui-shots/restart.sh
```
**Required after every `.ejs` edit and every `storage/lang/en/lang.json` edit** —
`app.set('view cache', true)` is unconditional and nodemon only watches `src/`.
Logs: `/tmp/opencode/panel-dev.log`. Port 3000.

### 7.2 Capture
```sh
node .agents/ui-shots/capture.mjs <out-dir> <path...>     # logged in
node .agents/ui-shots/shot.mjs    <out-dir> <path...>     # anonymous (auth)
MOBILE=1 VW=390 VH=844 THEME=light node .agents/ui-shots/capture.mjs <out> /
```
Env: `EMAIL` `PASSWORD` `VW` `VH` `THEME` `MOBILE` `FULL` `WAIT` `BASE` `LOGIN=0`.

### 7.3 Diagnostics
```sh
node .agents/ui-shots/routes.mjs   /a /b /c      # status + title + h1
node .agents/ui-shots/diag.mjs     <url>         # overflow offenders
node .agents/ui-shots/diag2.mjs    <url>         # computed styles
node .agents/ui-shots/render.mjs   views/path /tmp/x.html   # offline render
node .agents/ui-shots/serve.mjs    /tmp/x.html               # :3999
```

`render.mjs` **auto-stubs missing locals**: it retries on
`X is not defined` / `X is not a function`, guessing a default
(`ALL_CAPS` → `''`, `*Count|*Total|*Id` → `0`, `*Name|*Title|*Message` → `''`,
`is*/has*/can*` → `false`, otherwise `[]`, plus `() => ''` for callables) and
prints each guess. Add anything it guesses wrong to the `data` object in that
file. **All 119 views currently render offline** — keep it that way; if your
view stops rendering offline, you broke it.

### 7.4 Assets
After CSS/JS edits: `npx vite build` regenerates
`public/.vite/manifest.json` and `public/assets/css/panel-*.css`. The running
server reads the manifest from disk, so a rebuild is enough — no restart needed
for CSS, **restart needed for EJS.**

---

## 8. Verification gates

Run these in order. All must pass before you report a page done.

```sh
# 1. Build
npx vite build

# 2. Full test suite (1064 tests, ~2 min)
npx vitest run

# 3. Detector on your changed targets only
~/.impeccable/bin/0.1.6/impeccable detect --json views/<your files>

# 4. Final captures: desktop + mobile, and light theme
sh .agents/ui-shots/batch.sh /tmp/ui/final-<page> <route>
THEME=light node .agents/ui-shots/capture.mjs /tmp/ui/final-<page> <route>
```

**Tests that will catch you** (read them if they fail):
| Test | What it enforces |
|---|---|
| `tests/iconVocabulary.test.ts` | every `icon()`/`alIcon()` name resolves; **no raw `<svg>`** in views; stroke-width 1.5 default |
| `tests/elementIds.test.ts` | `getElementById` targets exist; inline view scripts only reference ids in that view |
| `tests/responsiveA11y.test.ts` | sidebar `hidden lg:block`; `#page-content` has `overflow-y-auto`; `<main>` landmark; labeled account inputs; toast a11y |
| `tests/designMotion.test.ts` | `--dur-*`/`--ease-out` tokens; reduced-motion block does not kill state feedback; **theme text contrast ≥4.5:1** |
| `tests/i18n/lingui.test.ts` | the *other* i18n system still loads — do not delete it |
| `tests/adminUsersHtmx.test.ts` | fragment ids `admin-users-list`, `admin-user-row-<id>`, `admin-users-create-form` + `role="alert"` |

Impeccable's rules also apply mechanically: contrast ≥4.5:1 body / ≥3:1 large,
card radii 12–16px, no coloured `border-left` >1px, no gradient text, no
emoji/unicode as icons, no kicker above a heading, elevation declared once.

### 8.5 Tools & MCPs available to you

| Need | Use |
|---|---|
| "What does this Tailwind / CSS / EJS API actually do?" | **context7** MCP: `resolve-library-id` then `query-docs`. Use it for Tailwind v4 (the repo is on `@tailwindcss/v4` — `@layer`/`@apply` semantics differ from v3), EJS, Playwright. Do not answer from memory. |
| "How is this page/flow supposed to work?" / "where is X?" | **explore** subagent (`agent: "explore"`, thoroughness `medium`/`very thorough`) — keeps file dumps out of your context. |
| Parallel, independent chunks of the same batch | **general** subagent — see §9 for the template. |
| Long reference text / big tool output | **caveman** compression before it enters context. |
| Design direction, critique, hardening | **impeccable** skill: `reference/{craft-floor,operate,critique,audit,extract,component-review}.md` + `~/.impeccable/bin/0.1.6/impeccable detect`. |
| Live DOM inspection / clicking | the **browser** MCP, or `.agents/ui-shots/*.mjs` if no desktop browser is attached. |
| Anything else | `websearch` for current docs/versions. |

**Do not** open a subagent for a single file read. Delegate when the unit of
work is independent and its output is a file edit or a report.

---

## 9. Delegating — subagent task template

The orchestrator assigns **one page (or one tight cluster) per subagent.**
Never give an agent more than ~4 related views; context does not survive it.

Copy this template and fill the brackets. Pass the full text to the subagent —
child sessions start with **no** context.

```
You are doing one slice of the Airlink Panel peak-UI port.

FIRST: read /home/tmz/repos/airlink/panel/instructions.md in full (§0–§8 are
mandatory). Then read
~/.agents/skills/impeccable/reference/craft-floor.md before your first edit.

ASSIGNMENT
  Pages/views:      [exact file paths under views/]
  Routes to capture:[verified routes from §10]
  Batch:            [number]
  Design reference: [path under /home/tmz/repos/airlink/ref/panel/views/ ...]

BOUNDARIES
  - Touch ONLY: your assigned .ejs files + the component CSS you create.
  - Shared files via helpers, NEVER by hand:
      storage/lang/en/lang.json  -> node .agents/i18n/add.mjs ...
      views/styles/main.css      -> node .agents/css/import.mjs ...
    (both take a lock; concurrent agents are safe)
  - views/layouts/**, views/partials/**, views/styles/components/*.css that you
    were not assigned are Batch 0's. If you need a shell or shared-class change,
    REPORT it — do not make it.
  - NEVER touch src/** (exception: i18n wiring only), tests/**, locales/**,
    src/i18n/**, other batches' views, .agents/** tooling, or git write commands
    (no commit / checkout / stash / clean).
  - The dev server is shared. Restart ONLY via `sh .agents/ui-shots/restart.sh`
    (it locks, so concurrent calls queue) and expect other agents' pages to
    change under you.

WORKFLOW (strict, per the user's instruction)
  1. Restart server, capture desktop dark + mobile dark for every assigned route.
  2. Analyse the whole page. Write down findings BEFORE editing.
  3. Fix page-level issues.
  4. Then component-by-component: inventory every distinct element on the page,
     map each to the component library (instructions.md §3.4), fix or create
     the component. Create components in views/styles/components/ inside
     @layer components, never as <style> blocks in the view.
  5. Confirm EVERY component on the page is accounted for — no unclassified
     elements, no one-off inline styles, no raw colours, no raw <svg>,
     no hardcoded English.
  6. Mobile pass: no horizontal overflow (diag.mjs), 44px targets, header
     actions stack, tables adapt.
  7. Gates: `npx vite build`, `npx vitest run`, then
     `~/.impeccable/bin/0.1.6/impeccable detect --json <your files>`.
     Batch-fix everything they show, one confirm round max, then STOP.

REPORT BACK (concise)
  - Component-accounting table for every page (§6.4 deliverable), in full
  - Files changed (paths only)
  - New component classes + where they live (and whether you registered them)
  - New i18n keys (the exact keys you passed to add.mjs)
  - Shell/shared changes you REQUESTED but did not make
  - Anything you found that needs a backend change (do NOT make it)
  - Gate results (build / test / detector) + final desktop & mobile captures
```

**Parallelism rule:** agents may run concurrently only if their `.ejs` file sets
are **disjoint**. Shared singletons are never hand-edited — use the locking
helpers:

| Shared file | Mechanism |
|---|---|
| `storage/lang/en/lang.json` | `node .agents/i18n/add.mjs …` (§5) |
| `views/styles/main.css` | `node .agents/css/import.mjs …` (§4.1) |
| dev server on :3000 | `sh .agents/ui-shots/restart.sh` — serialised by a lock file; concurrent calls queue |
| `.agents/ui-shots/*` | read-only to page agents; the orchestrator owns it |

`views/partials/**`, `views/layouts/**` and `views/styles/components/*.css`
are owned by **Batch 0 only**. A page agent that needs a shell or shared-class
change **reports it instead of making it.**

**Translation-key races:** solved — always go through `add.mjs`, which locks,
merges, sorts and renames atomically (verified with 8 concurrent writers).

---

## 10. Page inventory & batches

Verified against the running dev server (admin session). `SID` =
`11111111-2222-4333-8444-555555555555` (the seeded "Test Server").

### Batch 0 — shell & shared chrome  ⟵ **DONE** (record in §13)
`views/layouts/*` · `views/partials/topbar.ejs` · `partials/bottom-nav.ejs` ·
`partials/user-sidebar.ejs` · `partials/admin-sidebar.ejs` ·
`partials/search-overlay.ejs` · `views/styles/components/{topbar,sidebar}.css`

### Batch 1 — user pages  ⟵ **IN FLIGHT** (`views/user/dashboard.ejs` + `partials/server-card.ejs` already DONE by Batch 0)
| Route | View | Old reference |
|---|---|---|
| `/` | `views/user/dashboard.ejs` | `ref/panel/views/user/dashboard.ejs` |
| `/account` | `views/user/account.ejs` | `ref/panel/views/user/account.ejs` |
| `/credits` | `views/user/credits.ejs` | — |
| `/create-server` | `views/user/create-server.ejs` | — |
| `/my-images` | `views/user/my-images/index.ejs` | — |
| `/my-images/new` | `views/user/my-images/new.ejs` | — |
| `/my-images/edit/:id` | `views/user/my-images/edit.ejs` | — |

### Batch 2 — server console & files  ⟵ **IN FLIGHT**
`SID` = the seeded server id above.

| Route | View |
|---|---|
| `/server/SID` | `views/user/server/manage.ejs` *(note: omits `user-footer` — known quirk, do not change)* |
| `/server/SID/console` | `views/user/server/console.ejs` |
| `/server/SID/files` | `views/user/server/files.ejs` (+ `file-detail.ejs`, `files-rows.ejs`) |
| `/server/SID/logs` | `views/user/server/logs.ejs` |
| `/server/SID/sftp` | `views/user/server/sftp.ejs` |
| `/server/SID/settings` | `views/user/server/settings.ejs` (+ `fragments/user/server/settings-form.ejs`) |
| `/server/SID/startup` | `views/user/server/startup.ejs` (+ startup-*.ejs fragments) |
| `/server/SID/backups` | `views/user/server/backups.ejs` **⚠ route 500s on this seed — render offline with `render.mjs` and screenshot via `serve.mjs`** |

### Batch 3 — server sub-pages  ⟵ **IN FLIGHT**
| Route | View |
|---|---|
| `/server/SID/players` | `views/user/server/players.ejs` |
| `/server/SID/worlds` | `views/user/server/worlds.ejs` |
| `/server/SID/subusers` | `views/user/server/subusers.ejs` |
| `/server/SID/schedules` | `views/user/server/schedules.ejs` |
| `/server/SID/databases` | `views/user/server/databases.ejs` (+ `fragments/user/server/db-list.ejs`) |

### Batch 4 — admin core (all verified 200)  ⟵ **DONE** — split and shipped as 4a (`overview,servers,nodes`) + 4b (`users,activity,analytics` + `fragments/admin/users`)
`/admin/overview` · `/admin/servers` · `/admin/servers/create` ·
`/admin/servers/edit/:id` · `/admin/nodes` · `/admin/nodes/create` ·
`/admin/node/:id` · `/admin/node/:id/stats` · `/admin/users` ·
`/admin/users/create` · `/admin/users/edit/:id` · `/admin/users/view/:id`
Views under `views/admin/{overview,servers,nodes,users}/`.

### Batch 5 — admin data  ⟵ **IN FLIGHT** (`activity`, `analytics` already DONE by Batch 4b)
`/admin/activity` · `/admin/analytics` · `/admin/apikeys` · `/admin/api/docs` ·
`/admin/databases` · `/admin/databases/create` · `/admin/images` ·
`/admin/images/edit/:id` · `/admin/images/store` · `/admin/mounts` ·
`/admin/mounts/new` · `/admin/playerstats` · `/admin/queue`
Views under `views/admin/{activity,analytics,apikeys,databases,images,mounts,playerstats,queue}/`.

### Batch 6 — admin system  ⟵ **NOT STARTED**
`/admin/settings` · `/admin/security` · `/admin/menu` · `/admin/addons` ·
`/admin/addons/store` · `/admin/addons/:slug` · `/admin/radar` ·
`/admin/radar/scripts` · `/admin/radar/scripts/create` ·
`/admin/radar/scripts/edit/:id`
Views under `views/admin/{settings,security,menu,addons,radar}/`.
*(Routes probed: `/admin/menu`, `/admin/security`, `/admin/queue`, `/admin/radar/scripts` all 200. `/admin/nodes/stats` is 404 — the real route is `/admin/node/:id/stats`.)*

### Batch 7 — fragments (HTMX) — **id-sensitive**  ⟵ **NOT STARTED** (except `fragments/admin/users/*`, done by 4b, and `fragments/user/server/*`, split between Batches 2 and 3)
`views/fragments/**` — 19 files. These are returned by partial routes, so
capture them offline via `render.mjs` + `serve.mjs`.
**Constraint:** keep them shell-free and preserve ids
`admin-users-list`, `admin-user-row-<id>`, `admin-users-create-form`, and
`role="alert" aria-live="assertive"` where present (`tests/adminUsersHtmx.test.ts`).

### Batch 8 — errors & remaining  ⟵ **NOT STARTED**
`views/errors/{403,404,500,generic}.ejs` (offline-render them),
`views/partials/empty-state.ejs`, `pagination.ejs`, `stat-card.ejs`,
`status-badge.ejs`, `flash-messages.ejs`, `toast.ejs`, `global-modal.ejs`,
`upload-modal.ejs`, `head-meta.ejs`.

### Already done — do not redo
`views/auth/*` (login, register, 2fa-verify, forgot-password, reset-password),
`views/partials/auth-visual.ejs`, `views/partials/ui/{button,form-field}.ejs`,
`views/partials/topbar.ejs` (structure), foundation CSS
(`base/typography`, `base/reset`, `components/{button,card,table,badge,field,topbar}`,
`pages/{page-layout,auth}`), both theme files, self-hosted General Sans.

---

## 11. Known quirks — do not "fix" these

1. **Layout sandwich.** `layouts/user.ejs` opens `base` → `<main>` → `<div class="flex h-screen">` → sidebar div → `flex min-w-0 flex-1 flex-col` → `#page-content`. `user-footer.ejs` closes them. **The opening and closing `<div>` counts must match.** Same for `admin.ejs` / `admin-footer.ejs`. If you add a wrapper, add its closer in the footer partial.
2. **`view cache` is always on.** Restart after any `.ejs` edit (§7.1).
3. **`views/user/server/manage.ejs` deliberately omits `user-footer`.** Leave it.
4. **Two i18n systems.** Live = `t()`/`tn()` + `storage/lang`. Dead-but-tested = lingui under `src/i18n` + `locales/`. Never delete the latter.
5. **Fragments must stay shell-free** and keep their ids (§10 batch 7).
6. **`/admin/nodes/stats` is 404**; use `/admin/node/:id/stats`.
7. **`/server/SID/backups` 500s** on this seed — not a UI bug.
8. **`/activity` is 404**; the activity log is `/admin/activity`.
9. **Eruda** (dev-only floating console button) appears bottom-right in dev
   screenshots. Ignore it; it is not part of the design.
10. **`motion.css` stays unlayered** so its reduced-motion overrides win.
11. **CSP:** `fontSrc ['self','data:']` (no font CDNs), `styleSrc ['self','unsafe-inline']`, `imgSrc ['self','data:','blob:','https:']`, `scriptSrc` strict-dynamic + nonce. Inline `<style>` in a view is allowed (that is why `.al-auth`'s page CSS was legal), but **prefer a component file**.
12. **`/vendor` serves `node_modules` directly**, so `assetUrl('/vendor/…')` works without a build.
13. **Do not remove `hidden lg:block` on the sidebar**, `overflow-y-auto` on `#page-content`, or the `<main>` element — tests assert them.
14. **Include roots are only `layouts/`, `partials/`, `partials/ui/`.** The old
    `views/components/` directory was folded into `views/partials/`. Anything
    still including `.../components/x` is a stale path — there is no such
    directory and EJS will throw.
    (`fragments/user/server/startup-variables.ejs` was the last one; fixed.)

---

## 12. Do-not-touch list (recap)

```
src/**                     (except i18n wiring, which is a separate phase)
tests/**
locales/**, src/i18n/**, lingui.config.ts
storage/lang/{de,es,fr,it,ja,pt,ru,ta,zh}/lang.json
storage/prisma/**
views/fragments ids & structure   (except in Batch 7, carefully)
.git — no commits, no checkouts, no stashes
node_modules/** — tooling belongs in .agents/
```

---

## 13. In-flight — Batch 0 (shell), pick up from here

Work already started on the shell; finish it before any page batch.

**Done:**
- Foundation CSS rewritten (`typography`, `reset`, `button`, `card`, `table`,
  `badge`, `field`, `page-layout`), all component/page CSS wrapped in
  `@layer components`.
- Both theme files rewritten (light = white page / blue-600 primary;
  dark = `#141414` page / `#202020` card / blue-600 buttons).
- `views/partials/topbar.ejs` added and wired into `user.ejs` + `admin.ejs`.
- `search.js` updated to support **multiple** triggers
  (`[data-search-trigger]`) — origin animation uses `lastTrigger`,
  `aria-expanded` syncs across all triggers.
- Search dialog copy translated end-to-end: `search-overlay.ejs` reads every
  visible string from `t()` (+ `data-empty-title`/`data-empty-hint`), and
  `search.js` resolves its JS-side strings through `tx()`/`txAdmin()` reading
  `window.__i18n` (English kept only as last-resort fallback).
- `#searchInput` focus re-themed in `topbar.css` (components-layer rule →
  `--theme-primary` border + 18% ring, matching `.al-form-input`); dropped
  the input's `outline-none` so `reset.css` can own the focus outline.

**STATUS — ALL SEVEN ITEMS COMPLETE.** Verified: `npx vite build` ✓ ·
`npx vitest run` → **1064/1064 passed** ✓ · all **69/69** page views render
offline ✓ · `impeccable detect` clean (one pre-existing `transition: width`
warning in `components/progress.css`). Kept below as the worked example of
what "done" looks like for a batch.

1. **Tag the desktop search button** in `views/partials/topbar.ejs` with
   `data-search-trigger` (it currently has only `id="searchButton"`), so the
   new multi-trigger code actually binds.
2. **Add search + theme toggle to the mobile top bar**
   (`views/partials/bottom-nav.ejs`, the `.mobile-top-bar` block). Today the
   phone top bar is logo + avatar only — search and light/dark are lost below
   1024px. Requirements:
   - Search button: `data-search-trigger`, `aria-haspopup="dialog"`,
     `aria-expanded="false"`, `aria-controls="searchOverlay"`, `aria-label`
     from `t('navSearch')`, ≥44px target.
   - Theme switch: same `role="switch"` / `aria-checked` markup as the desktop
     `.al-theme-switch`, ≥44px target.
3. **Move the theme-toggle script out of `topbar.ejs`.** It only queries
   `getElementById('themeToggle')` and lives inside `hidden lg:flex`, so it
   never runs on phones. Make it bind **all** `[data-theme-toggle]` elements
   and sync them together (mirror what `search.js` now does), then include it
   once from `layouts/base.ejs` so both bars are covered.
4. **Add `.al-alert-title` / `.al-alert-body`** to
   `views/styles/components/toast.css` — the old notice anatomy is icon +
   bold title + body; the current `.al-alert-*` has no children defined.
   (Documented in §3.4.)
5. **Add `.al-segmented`** — the old panel's grid/list view switch
   (`inline-flex p-1 rounded-lg` track, `px-3 py-1.5 text-sm rounded-md`
   segments, active segment gets `--theme-bg-card` + `--theme-text-strong`).
   Put it in `views/styles/components/button.css`, and wire the dashboard's
   Grid/List toggle (§13.6) with `aria-pressed` on each segment.
6. **Dashboard page** (`views/user/dashboard.ejs`) — first page of Batch 1:
   - Replace the ad-hoc header (`px-4 sm:px-6 lg:px-8 pt-4` +
     `text-xl font-semibold`) with `.al-page-header` + `.al-page-title` +
     `.al-page-desc` + `.al-page-body`.
   - Wrap the `createServer` action as the header's second child; drop the
     redundant `inline-flex items-center gap-1.5`.
   - Move the `errorMessage` block to `.al-alert-warning` + title/body.
   - Restore the old **Grid/List toggle** (§13.5) as the header's action.
   - Grid gap `gap-3` → `gap-4` (old value).
7. **Rebuild `views/partials/server-card.ejs`** to the old anatomy:
   - `.al-card` root, `p-5`-equivalent body (default pad is already `1.25rem`).
   - Header row: name `text-lg font-semibold truncate` + status chip using
     `.al-badge-online` / `.al-badge-offline` (with `.al-dot-ping` when running).
   - Stat rows: `flex justify-between` label (`text-sm` muted) + value in an
     `.al-badge-neutral font-mono` chip — RAM, CPU (old card had exactly two).
   - Footer strip: `.al-card-footer` with status text left (dot + `Online` /
     `Offline`) and a `Manage →` affordance right. Because the whole card is an
     `<a>`, render `Manage` as `<span aria-hidden="true">`, never a nested `<a>`.
   - Keep `href="/server/<UUID>"` on the root and keep the accessible name
     readable (name first, then stats).

---

*Last updated: see git history. Update §3.4 and §13 whenever you introduce a
component — the next agent depends on it.*
