# Intent · 10 · Include

> Accessibility audit of Airlink Panel against WCAG 2.2 (AA target, per DESIGN.md commitment). Method: static audit of views/components with evidence for each finding; keyboard map; screen-reader flow notes; remediation plan prioritized by human impact.

---

## Verdict

The panel is **unusually strong on accessibility for its class** — a real keyboard/focus/ARIA discipline is baked into the components, not bolted on. The gaps are consistency debt in deep/admin surfaces and a handful of native-alert and label fallbacks that break the pattern. The plan below protects the strong core and closes the debt.

---

## Accessibility Audit — Per WCAG Principle

### Perceivable

**Color independence — PASS (exemplary).** Status is never color-only: pills, dots, and text labels coexist (`manage.ejs:1330-1352` status card labels; dashboard status pills). `stopped`/`killed` → "Server stopped" (not a color). This is a deliberate, correct implementation of WCAG 1.4.1.

**Contrast — MOSTLY PASS, needs a token pass.** The theme system uses CSS variables (`--theme-*`, `--theme-text-muted` etc.). `muted` text on secondary backgrounds is the known risk; several deep-surface instances use `neutral-400`-class text. Automated scan (axe) on both light/dark is the first action; fix token values rather than per-page overrides. Confirm both modes hit 4.5:1 body / 3:1 large + UI-component boundaries.

**Text alternatives — PASS with sweep.** Icon buttons carry `aria-label` (sftp.ejs copy buttons:62-92, close buttons everywhere). The **legacy store modal** (`store.ejs`) uses some `w-6 h-6` icon-only buttons without labels in a few spots — verify. Spot-check admin tables for inline icon-only actions without `aria-label`.

**Reflow — PASS for main surfaces.** Layouts are token-based and fluid; the 11-item sub-nav uses `whitespace-nowrap` horizontal scroll (serverTemplate.ejs:94) which is **horizontal scrolling at 320px** — acceptable for nav strips but flagged: ensure the overflow container is keyboard-scrollable (it is, via focus). Verify no admin table traps fixed widths.

**Media — PASS (n/a).** No autoplay media; reduced-motion guards exist (`loadingPopup.ejs:23`, `bottomNav.ejs:52`).

### Operable

**Keyboard — PASS in core.** Skip link (header.ejs:60, `sr-only focus:not-sr-only`), tab-indexed search combobox (template.ejs:303), roving tabs (store.ejs:674-675), arrow-key option navigation (portsAllocator.ejs:292-303), Ctrl-K search, Ctrl/Cmd-S save (file.ejs:409-414).

**Focus traps — PASS in core modals.** `modal.ejs:85-98` traps Tab within panel + Escape + focus restore to trigger (`modal.ejs:60-61`). Same pattern in `sftp.ejs:126-153`, `imageViewer.ejs:87-93`, `bottomNav.ejs:180-187`. **Exception:** the **legacy `m-overlay` in store.ejs** and **`confirm-overlay` in create-server.ejs** need the same audit — if they don't trap/restore, they're the inconsistency hole (/specify consolidation target).

**Time limits — PASS.** No auto-logout timer found with 20s-warning gap; the "stopping" timeout (console.ts) is server-side, not user-facing. Session expiry surfacing is a /fortify P2 (401 interception) — also an a11y concern (a silent failure is a cognitive-accessibility failure).

**Touch targets — MOSTLY PASS.** Bottom-nav links are `min-h-44px` (bottomNav.ejs:63-137), theme toggle ≥36px, mobile sheet close 44px. **Findings:** `store.ejs:343` close button is 24×24 (`w-6 h-6`) — below WCAG 2.2 minimum; copy buttons in sftp.ejs are 32×32 (`w-8 h-8`) — below recommended; some `text-xs` action buttons in tables may fall below 24px. Sweep all icon-close/copy buttons to ≥44px.

### Understandable

**Reading level — PASS for audience.** Technical panel; error messages are concrete and plain ("The daemon appears to be offline." manage.ejs:282). Avoid alarm language; the /articulate error contract keeps this.

**Consistency — the biggest risk.** Two modal systems, per-page toasts, native `alert()` fallback (schedules.ejs:750-766, subusers.ejs:346-355), "Overview" vs "Dashboard". This is the #1 cognitive-accessibility issue: **inconsistent patterns force relearning** (WCAG 3.2.3).

**Predictability — PASS.** No auto-submitting selects, no hover-triggered destruction. Double-confirm on destructive ops (settings.ejs:171-205).

**Input assistance — PASS with gap.** Placeholders are consistently backed by `aria-label`/labels (search combobox template.ejs:303; theme toggle topbar.ejs:284). **Gap:** verify all form inputs in admin/account have visible labels, not placeholder-only (placeholder-is-not-label rule). Ports allocator is a well-labeled composite (portsAllocator.ejs:225-228).

### Robust

**Semantic HTML — PASS.** Buttons/links/lists used semantically; `nav` with `aria-label` (bottomNav.ejs:25); breadcrumb `nav` (breadcrumb.ejs:5); landmarks exist (skip link target `#page-content`).

**ARIA used correctly — PASS.** `role="dialog" aria-modal` on sheets; combobox + listbox + activedescendant search; roving tabindex on tabs; `aria-expanded` on toggles; `inert` on closed mobile sheet (bottomNav.ejs:48) — a genuinely sophisticated detail. **One caution:** `portsAllocator.ejs:3` uses `role="presentation"` + `aria-hidden` on the overlay while children get `role="dialog"` — verify the presentation container doesn't hide the dialog from AT when open.

**Live regions — PASS with gap.** Toast container `aria-live="polite"` (toast.ejs:29), `actionFeedback` polite (loadingPopup.ejs:28). **Gap:** console WS status changes (online→offline→crash) should announce politely to the status region; currently the banner appears but there's no live-region announcement of "Server stopped" transitions. Add `aria-live="polite"` to the status card or use the toast.

---

## Screen Reader Flow — Incident flow (console)

1. Skip link → `#page-content`.
2. Server sub-nav (11 links; screen reader hears 11 ungrouped destinations → **the strongest argument for /organize grouping**).
3. Status card: "Online/Offline/Stopped" — needs the crash vs stop distinction announced (see P1-1).
4. Console: input labeled; placeholder "Waiting for container..." (manage.ejs:794) announces via input.
5. Power controls: labeled buttons (Restart/Stop) with confirmation dialog (`role="dialog"` + focus trap + Escape).
6. Lifecycle label ("Pulling image") — currently not in a live region; transitions should announce.

**Mobile:** bottom-nav `aria-label="Mobile navigation"`, More button `aria-expanded`, sheet `role="dialog"` + `inert` when closed, Escape + focus return. Reference-quality.

---

## Keyboard Navigation Map (core flows)

| Flow | Tab | Esc | Shortcuts | Trap |
|---|---|---|---|---|
| Search | into combobox → arrows through listbox | closes | Ctrl-K | none (overlay) |
| Console | into terminal input → power buttons → sub-nav | — | Ctrl/Cmd-S in editor | none |
| Confirm dialog | first focusable (Cancel) | closes, returns focus | — | modal.ejs:85-98 ✅ |
| Mobile More | sheet focusables cycle | closes | — | bottomNav.ejs:180-187 ✅ |
| Store (legacy) | **unverified trap** | closes (store.ejs:682) | — | **audit needed** |
| Ports allocator | extBtn → arrows in listbox | closes | — | ✅ (portsAllocator.ejs:433) |

---

## Remediation Plan

### Critical (P0)
| # | Issue | Evidence | Fix |
|---|---|---|---|
| 1 | **Crash vs. stop indistinguishable to AT + sighted users** | manage.ejs:1350-1352 | Distinguish "Crashed" status + announce via live region; feeds /fortify P1-2 |
| 2 | **Native `alert()` fallback in three pages** | schedules.ejs:750, subusers.ejs:346, databases | Remove fallbacks; always use `window.modal.confirm`; never `confirm()` |

### High (P1)
| # | Issue | Evidence | Fix |
|---|---|---|---|
| 3 | **Unsave-guarded editor** (data-loss = cognitive/motor issue too) | file.ejs:368-414 | /fortify P0-1 (beforeunload + dirty state) |
| 4 | **Touch targets <44px** | store.ejs:343 (24px), sftp.ejs:62-92 (32px) | min 44×44 for close/copy; 8px spacing |
| 5 | **Live region for server status transitions** | status card (manage.ejs:1360-1389) | `aria-live="polite"` on status text; announce crash/stop/start |
| 6 | **Placeholder-only labels audit** | admin/account/startup forms | Ensure visible `<label>` or `aria-labelledby` everywhere; placeholder is not a label |
| 7 | **Legacy modal a11y parity** | store.ejs m-overlay, create-server.ejs confirm-overlay | Focus trap + restore + Escape audit; fold into /specify consolidation |
| 8 | **Console input lock SR announcement** | manage.ejs lockInput (794) | When daemon-offline locks input, announce via live region ("Console paused — daemon offline") |

### Medium (P2)
| # | Issue | Evidence | Fix |
|---|---|---|---|
| 9 | **Muted-contrast token pass both modes** | `--theme-text-muted` usages | axe scan light+dark; fix tokens ≥4.5:1 body, 3:1 UI |
| 10 | **Horizontal sub-nav at 320px** | serverTemplate.ejs:94 | /organize grouping reduces item count; ensure overflow scroll container is announced/focusable |
| 11 | **Icon-only admin table buttons sweep** | admin views | `aria-label` on every icon action; automated scan |
| 12 | **Session-expiry as silent failure** | global fetch | /fortify P2-10 (401 → polite announcement) |
| 13 | **`role="presentation"` wrapper check** | portsAllocator.ejs:3 | Confirm dialog children remain AT-visible when open |

### Low (P3)
| # | Issue |
|---|---|
| 14 | Document custom shortcuts (Ctrl-K, Ctrl/Cmd-S) in a keyboard-shortcuts help dialog, per WCAG 2.1 (remappable) |
| 15 | 400% zoom reflow test on admin tables; add horizontal-scroll wrapper where tables must stay 2D |
| 16 | Voice-control test pass: ensure every action reachable by spoken labels (no duplicate unlabeled icons) |

---

## Testing plan (built into /specify)

1. **Automated:** axe-core on all 81 views × (light, dark) — CI-gated at P0/P1 severity. ~30% coverage.
2. **Manual keyboard:** full incident + provision + files flows keyboard-only, both breakpoints.
3. **Screen reader:** NVDA (Windows) + VoiceOver (macOS) on console, files bulk, search, mobile More sheet.
4. **Contrast:** token-level audit both themes; worst-case (muted text on card).
5. **Reduced motion + zoom 200/400%:** verify transitions degrade and reflow holds.

## Handoff
- **/specify:** P0-1, P0-2, P1-3..8 are spec-ready with exact files; testing plan above.
- **/fortify:** P0-1, P0-2, P1-3, P2-12 shared (data-loss + session-expiry).
- **/organize:** sub-nav grouping directly improves AT wayfinding (P2-10).
- **/articulate:** status/error/confirm copy must stay plain-language per WCAG 3.1.
- **/localize:** RTL/CJK filename + label expansion budget for labels (they become the ARIA names).
