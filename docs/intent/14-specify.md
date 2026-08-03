# Intent · 14 · Specify

> Engineering handoff for the "Predictability at the edges" campaign. Consolidates decisions from 08–13 into prioritized, non-breaking implementation items; answers all pending questions raised across the sequence; documents the addon UI contract. Each item names its intent (why), behavior, copy, states, accessibility, and success criteria.

**Owner:** Design + Product (this spec is authored by the Intent sequence; engineering owns estimates)
**Status:** Ready for engineering triage
**Design doc versions:** docs/intent/01-14 (strategize → specify)

---

## Problem & User Need

The panel's best surfaces (auth, dashboard, console) set a high bar; its deep-work surfaces (files, backups, schedules, admin) drift below it: three modal systems, per-page toasts with native `alert()` fallbacks, an ungroupled 11-item sub-nav, i18n that stops at the hard parts, and a file editor that can silently destroy work. Operators use this product at the worst moments of their day — a crashed server at 2am. Every change below tightens the gap between "panel baseline" and "edge surfaces" without a redesign.

## Ethical Review

**Patterns reviewed:** confirmation flows, destructive-action gating, empty/error states, status displays, power controls, unsaved-change guards, native `confirm()`/`alert()` usage.
**Concerns:** the crash-reason surfacing must not fabricate a reason (honest "open logs" fallback required — see Item 2); the unsaved-guard must never *trap* (always a clear "Discard" path); the restart-primary test must not raise accidental stops (guardrail in /measure §4).
**Dark pattern clearance:** cleared. No deceptive, coercive, or manipulative patterns. Confirm dialogs are Cancel-first; no urgency, no shame, no default-destructive actions.

---

## Measurement (summary; full in 13-measure.md)

- **Primary:** incident task completion; data-loss = 0; time-to-reason after crash.
- **Counter-metrics:** accidental-stop rate, blind-restart-after-crash rate, Ctrl-K reliance growth, phantom-save rate.
- **Instrumentation:** extend the existing activity logger (already emits `server:stop`, `server:restart`, `server:start`). Add events: `file.editorDirtyLeave`, `file.editorDiscard`, `file.editorSaveFailure`, `crash.statusShown`, `provision.funnel.{step}`, `nav.deepSurfaceTarget`. Wire from the JS handlers in the items below — no new infra.

---

## Implementation Items (prioritized, non-breaking)

### Item 1 · P0 — File editor unsaved-changes guard
**Intent:** Nothing destroys an operator's work silently. This is the campaign's P0 — the one real data-loss path.
**Files:** `views/user/server/file.ejs` (edit `saveFile` and add listeners; keep Monaco untouched).
**Behavior:**
- Track `dirty = (editor.getValue() !== lastSavedValue)` on `editor.onDidChangeModelContent`; reset on successful save (line ~392).
- On navigate-away (`beforeunload`) with `dirty`: standard browser "unsaved changes" prompt. (This matches the existing precedent in `files.ejs:737` / `worlds.ejs:165`.)
- On in-app nav away (sub-nav/back) with `dirty`: Cancel-first confirm dialog via `window.modal.confirm` — **never** `window.confirm`.
- Save failure: keep content in the editor (already the case at file.ejs:393-395), toast stays; offer Retry (re-run `saveFile`).
**Copy:** dialog title "Unsaved changes"; body "You have unsaved changes in this file. Leave anyway?"; buttons Discard / Keep editing (Cancel-first: focus on "Keep editing").
**Accessibility:** dialog = existing modal pattern (focus trap + Escape + focus restore); `beforeunload` message is browser-provided.
**States:** clean / dirty / dirty-and-saving / dirty-save-failed / discard.
**Success:** data-loss events = 0 (see /measure Bet C); no phantom saves.

### Item 2 · P1 — Crash-reason surfacing on the console
**Intent:** A crash and a deliberate stop are currently indistinguishable (manage.ejs:1350-1352). Diagnosis should take seconds.
**Files:** `views/user/server/manage.ejs` (statusCardLabels + render), daemon status payload (add `lastExitCode` / `lastExitReason` when the daemon has one).
**Behavior:**
- When status type is `killed` or `stopped` **without** a user-issued stop in the last N seconds (server-side already tracks `stopping` flag in console.ts:264): render "Server crashed" as the status label, not "Server stopped".
- If daemon supplies an exit code/reason (e.g., 137 = OOM): show "Server crashed (exit 137 — likely out of memory)" with an inline "Open logs" link to the log view.
- If no reason available: honest fallback "Stopped unexpectedly — open logs to see why." **Never fabricate a reason.**
**Accessibility:** status text gets `aria-live="polite"` so the transition announces.
**Copy:** title + reason + action as above, plain-language per /articulate contract.
**Success:** time-to-reason median (see /measure Bet B); restart-after-crash-without-reading stays flat.

### Item 3 · P1 — Consolidate the modal systems
**Intent:** One modal pattern everywhere (the /evaluate H4 finding). The modern `al-sheet-overlay/al-sheet-panel` + `window.modal` is the standard.
**Files:** replace `store.ejs` `m-overlay/m-dialog` and `create-server.ejs` `confirm-overlay` usage with the `window.modal` API; **remove** the native `confirm()` fallbacks in `schedules.ejs:750-766`, `subusers.ejs:346-355`, and the databases toast/alert path (databases.ejs:212).
**Behavior:** every confirm flows through `window.modal.confirm` (which already provides trap/Escape/restore). The legacy overlays can be deleted once migrated.
**Non-breaking:** keep the `m-*` markup in the DOM during the migration window; feature-flag the new modal path, ship, then delete dead code.
**Accessibility:** closes /include P0-2 and P1-7.
**Success:** grep for `confirm(` and `alert(` in views → 0; one modal implementation remains.

### Item 4 · P1 — i18n: three correctness fixes
**Intent:** Non-English users meet the product in English at the worst moments; the doc language is wrong today.
**Files:**
- `views/components/header.ejs:2` and `auth-header.ejs:6`: `<html lang="en">` → `<html lang="<%= req.lang %>">`.
- JS client strings: inject `window.__i18n = <%- JSON.stringify(requiredKeys) %>` (server selects only the keys JS needs) in the shared footer/template; convert hardcoded JS strings in file.ejs:392-395, schedules.ejs:750-766, subusers.ejs:346, backups.ejs:185, manage.ejs console strings to `t('key')`.
- Locale-aware dates: replace `toLocaleDateString()` (files.ejs:254 and any siblings) with `toLocaleDateString(req.lang)` via a shared helper.
**CI (this or parallel commit):** key-parity check comparing every locale's key set to en; fail on missing keys. Lint for hardcoded English literals in visible EJS text and in `showToast('...')`/`confirm('...')`.
**Success:** all 10 locales pass parity; `<html lang>` correct per request; zero hardcoded user-visible JS strings.

### Item 5 · P1 — Grouped server sub-nav
**Intent:** /organize's core: 11 flat items → **Run / Data / Manage / Settings**. The deepest work surface becomes the most navigable.
**Files:** `views/components/serverTemplate.ejs:94` (desktop strip + mobile overflow) + the mobile More-equivalent for the server nav (/transpose P1-1).
**Desktop behavior:** group labels above or as section chips; items unchanged in destination, order within group stable.
**Mobile behavior:** groups become a horizontal paged strip (swipe) or a bottom-sheet on the existing More pattern — **not** the current ungrouped `whitespace-nowrap` scroll.
**Labeling:** Run = Console, Players; Data = Files, Backups, Schedules, Databases; Manage = Startup, Worlds, Subusers; Settings = Settings, Admin (exact assignment in 05-organize.md). Keep breadcrumbs + Ctrl-K as secondary paths.
**Accessibility:** grouping improves screen-reader wayfinding (see /include P2-10).
**Success:** median nav-clicks to deep surfaces drops (see /measure Bet A); Ctrl-K reliance does not rise.

### Item 6 · P1 — Suspended-state messaging before rejection
**Intent:** A suspended server should explain *why* before the 403.
**Files:** `src/modules/user/server/console.ts:229-254,407-432` (plumb the message) + `manage.ejs` (already renders a suspended banner at line 126-134 when `server.Suspended`).
**Behavior:** the banner already exists server-rendered; ensure the WS status update can't override it with a generic failure, and that the action buttons stay disabled (they are — line 105/111/117). Engineering check: confirm the 403 body reaches the UI toast; if not, surface "Server is suspended — contact your administrator" from the response body.
**Success:** suspended servers never present a confusing dead action.

### Item 7 · P2 — Pagination component
**Intent:** files >500 entries and large tables currently DOM-crush and break console input on mobile.
**Files:** new `al-pagination` in `views/components/`; adopt in files list, backups, schedules, databases, admin tables.
**Behavior:** shared paging with page-size memory; list header shows counts; virtualize or page past 500 file entries. Keyboard: arrows + Enter; `aria-current="page"`.
**Success:** no freeze at 10k files; consistent paging everywhere.

### Item 8 · P2 — Mobile thumb-zone + WS throttle
**Intent:** /transpose P1-3/P1-4 — one-thumb power on mobile; no battery/bandwidth bleed.
**Files:** `manage.ejs` mobile layout (line 241+), WS client (line 1505+).
**Behavior:** on <lg, place Start/Restart/Stop and copy-IP within the bottom 60% of the viewport; on `visibilitychange`→hidden or console idle >60s, throttle WS to a slow heartbeat and show "Live updates paused — tap to resume".
**Accessibility:** paused state announced via live region (/include P1-8).
**Success:** incident restart on mobile = ≤3 thumb taps; WS messages while backgrounded near-zero.

### Item 9 · P2 — Addon UI contract (see section below)
### Item 10 · P2 — Locale-aware formatting helper (folded into Item 4)
### Item 11 · P3 — Restart-primary A/B (see /measure §4; gate behind telemetry)

---

## Addon UI contract

The addon loader (`src/handlers/modulesLoader.ts`, version-gated `import()`) lets addons ship their own views. That freedom is exactly where fragmentation begins. **Contract (non-breaking, additive):**

1. **Chrome:** addon pages MUST render inside the existing layout (shared `template.ejs`/`serverTemplate.ejs` or accept a documented sandbox). No page-level `<html>`/`<head>` from addons.
2. **Components:** addons SHOULD use the shared `al-*` classes + `window.modal` + `showToast`; addons MUST NOT ship their own modal/confirm/toast implementations. Enforcement: lint/scan in the store-review step, and document in `docs/` addon guide.
3. **i18n:** addon-provided UI strings SHOULD localize via the same key mechanism; addon *metadata* (title/desc) is externalized today (`store.ejs:730` hardcodes `data-lang="en"`) — replace with a per-locale metadata field; English is the fallback.
4. **CSP:** addon views inherit the panel's CSP nonce. **Inline JS in addon HTML will be blocked** — the loader must (a) document "addons must ship scripts as files loaded with the nonce, or use the sanctioned script-injection API," and (b) expose a first-class nonce-aware script-tag mechanism rather than teaching addons to bypass CSP. This resolves the /blueprint fail-point 4.
5. **Versioning:** loader version-gates `import()` (already correct); keep the contract table in sync with the runtime version.
6. **Accessibility:** addon UI must meet the same AA bar; the store-review checklist includes a screen-reader/keyboard pass.

**Success:** the modal/toast/confirm system stays single-implementation after 10+ addons; no addon ships inline JS.

---

## Copy matrix (core strings — full library in 07-articulate.md)

| Element | Primary | Edge: daemon down | Edge: unknown cause | Market (DE) note |
|---|---|---|---|---|
| Editor guard title | "Unsaved changes" | — | — | Formal "Sie"; "Ungespeicherte Änderungen" |
| Editor guard body | "You have unsaved changes in this file. Leave anyway?" | — | — | Expansion +30% — budget 60ch EN → test 80ch |
| Crash label | "Server crashed (exit 137 — likely out of memory)" | daemon offline | "Stopped unexpectedly — open logs to see why" | Keep literal, no idiom ("abgestürzt") |
| Stop confirm | "Everyone gets disconnected. You sure?" (existing) | — | — | Keep as-is; verify ja/zh translation quality |
| Suspended | "This server's been grounded…" (existing) | — | — | **Idiom risk** — flag "grounded" for native review (12-localize P2-7) |

All strings through ICU-style placeholders; no concatenation (see 07 + 12).

---

## Pending Questions

**Engineering (does not block any P0/P1):**
- Does the daemon status payload currently carry an exit code/last reason, or does the field need adding daemon-side? (Affects Item 2 fallback path only — the honest-fallback works either way.)
- `window.__i18n` injection point: shared footer vs. per-view; confirm the server already passes a full `req.translations` we can subset without leaking keys. (Item 4.)
- WS visibilitychange throttling: confirm the server tolerates a client that stops sending keepalives for minutes. (Item 8.)
- Suspended 403 body plumbing: does `fetch` in manage.ejs read `data.error` from the reject response? (Item 6.)

**Design (for the design owner, not blocking):**
- Restart vs. Stop primary power control (06-wireframe open question) — resolved by the /measure §4 A/B once telemetry ships.
- Exact group assignment for Admin inside the server sub-nav (05-organize lists options; pick one, keep it stable).

---

## Test plan (from 10-include §Testing + 13-measure)

| Audience | What | Success looks like | How measured |
|---|---|---|---|
| Engineering | Items 1–6 | CI green; parity gate; 0 `confirm(`/`alert(` | automated + code review |
| QA | Full regression on console/files/schedules/backups/admin, light+dark, desktop+mobile | no regression; editor guard fires; crash label shows | manual matrix |
| A11y | keyboard + NVDA/VoiceOver pass on Items 1,2,3,5,8 | no P0/P1 a11y findings | axe + manual |
| End user | incident flow + provision funnel | /measure §3 funnel + Bet B metrics | telemetry + CSAT |

## Assets & deliverables
- `docs/intent/01-14` — full sequence (this doc is the handoff).
- `docs/intent/06-wireframes.html` — the reference visuals (console states, files bulk, grouped nav).
- `docs/intent/05-organize.md` — taxonomy; `07-articulate.md` — copy library; `13-measure.md` — telemetry/events.
- Token law: new UI uses `--w-*` tokens + 4px grid; no raw pixels in markup (design-system.css law).

## Appendix
- Standards applied: WCAG 2.2 AA (10-include), token law (wireframe skill), Intent anti-pattern catalog (08-evaluate clean verdict), CSP nonce + strict-dynamic (addon contract §4).
