# Intent · 08 · Evaluate

> Structured UX evaluation of Airlink Panel against Nielsen heuristics, the Intent anti-pattern catalog, and task-success analysis.
> Method: static audit of views/components (81 EJS files), interaction inventory, and cognitive walkthroughs of the incident and provision flows. No live usability test was run — the /investigate plan covers that; findings here are evidence-graded accordingly.

---

## UX Health Score: **78 / 100**

| Component | Weight | Score | Note |
|---|---|---|---|
| Heuristics (H1-H10) | 50% | 78 | Strong on status visibility, weak on consistency |
| Task success (key flows) | 30% | 80 | Incident flow strong; provision has adoption friction |
| Anti-pattern scan | 20% | 90 | Clean — no manipulative patterns found |

This is a genuinely good, operator-focused product. The score is held down by consistency debt across deep surfaces, not by broken fundamentals.

## Anti-Pattern Verdict: **Clean**

No Confirmshaming, Fabricated Scarcity, Prechecked Consent, Notification Spam, or Inaccessible Unsubscribe found. The panel's posture is honest by design: destructive actions are gated, status is never color-only, no urgency is manufactured. The one near-miss is a **Common UX Failure, not an anti-pattern**: a stuck install banner or silent failure would be Missing Feedback (High) — /fortify owns making failure paths always terminate.

---

## Priority Issues

### P0 — Critical
*None found.* No task is blocked by a defect that prevents completion, and no regulatory dark pattern exists.

### P1 — Major

**1. Pattern fragmentation across deep surfaces → `/specify` + `/fortify`**
`store.ejs` (m-overlay/m-dialog), `create-server.ejs` (confirm-overlay), and the modern `al-sheet-overlay/al-sheet-panel` coexist (H4). Three modal systems, three animation behaviors, three keyboard/focus contracts.
*Why it matters:* The core thesis is *predictable under pressure*. Fragmentation is the opposite of predictability; an operator who learned the sheet in Files meets a different dialog in the store.
*Evidence:* views/components/store.ejs, views/user/create-server.ejs:28-53, views/components/ui modal vs. al-sheet classes.

**2. i18n stops where the work gets hardest → `/localize` + `/articulate`**
Navigation, headers, account, and auth are translated (`req.translations.*`); files, backups, schedules, console controls, and most admin pages are hardcoded English (H2). A non-English operator meets the product in English exactly at the moment of maximum stress.
*Evidence:* dashboard.ejs:26 uses translations; files.ejs/backups.ejs/schedules.ejs/manage.ejs have hardcoded labels.

**3. Server sub-nav is an ungroupled 11-item strip → `/organize`**
Console/Files/Players/Schedules/Worlds/Startup/Backups/Subusers/Databases/Settings/Admin flat in `serverTemplate.ejs`; mobile = horizontal scroll (H8, wayfinding). Past the 7-9 item scan limit; the deepest work surface is the hardest to navigate.
*Evidence:* views/components/serverTemplate.ejs:34,92.

**4. First-run adoption cliff → `/journey`**
Daemon config is an out-of-band step surfaced only *after* the node is created ("Configure" action). The operator hits the invisible step cold.
*Evidence:* views/admin/nodes/nodes.ejs:72-78 + configure flow; /blueprint flow 3.

**5. `alert()` fallback in three pages → `/include`**
databases.ejs:212, schedules.ejs:303, subusers.ejs:272 re-instantiate local toasts with a native `alert()` fallback. Native alerts are hostile to screen readers and are a consistency break (H4, a11y).
*Evidence:* file:line refs above.

### P2 — Minor

**6. File editor dirty-state guard unverified → `/fortify`**
No evidence of an unsaved-changes guard in `file.ejs` (H3, H9). If absent, an operator who edits a long config and navigates away silently loses work. *Verify first* — this could be P1.
*Evidence:* views/user/server/file.ejs (417 lines, no guard found in inventory).

**7. No pagination component → `/organize` / `/fortify`**
Only inline prev/next in dashboard.ejs:216-226. Large fleets and long file trees scale without a shared pattern (H6, H7).
*Evidence:* views/user/dashboard.ejs.

**8. Mobile discovery asymmetry → `/transpose`**
Bottom rail = first 4 items + "More"; the More sheet hides the admin section. A first-time mobile admin cannot orient (H1, wayfinding).
*Evidence:* views/components/bottomNav.ejs:48-145.

**9. Crash reason not auto-surfaced → `/fortify` (verify)**
Crash-loop diagnosis relies on the operator opening logs; the last-known failure reason is not a guaranteed status line on the console.
*Evidence:* views/user/server/manage.ejs (requires verification of daemon status fields).

**10. Bulk confirm lacks scale in some surfaces → `/articulate`**
Files delete confirm is numbered in code intent; other bulk confirms ("Delete selected backups?") don't state the count (H9). Risk is unlegible without the number.
*Evidence:* views/user/server/files.ejs:595, backups.ejs:185.

### P3 — Cosmetic
- "Overview" (admin) vs. "Dashboard" (owner) — same job, two names (H4, minor; /organize).
- Icon-only controls generally have aria-labels (good); a handful of inline buttons in admin pages may not (spot-check in /include).
- Search zero-results treatment unverified (H9) — does the Ctrl-K overlay suggest alternatives?

---

## Heuristic scores

| H | Score | Finding |
|---|---|---|
| H1 Status | **4** | The strongest heuristic. Status pills + labels, resource cards, install step banners, daemon-offline banners with retry. Real-time state is the product. |
| H2 Match | 2 | Domain terms are right ("Worlds", "Startup"); but untranslated deep surfaces break match for non-English operators. |
| H3 Freedom | 3 | Double-confirm on delete/reinstall, Cancel-first modals, Escape everywhere, session-persistent selection. Guard: dirty-state editor unverified. |
| H4 Consistency | 2 | Three modal systems; local toast re-instantiation with alert() fallback; "Overview"/"Dashboard" duplication. The debt the whole strategy targets. |
| H5 Prevention | 3 | Destructive gating is exemplary; inline validation exists in forms; over-allocation not blocked live at provision (shows at submit). |
| H6 Recognition | 3 | Ctrl-K search + pageCatalog + recent searches is excellent. Sub-nav depth hurts recognition of what exists. |
| H7 Efficiency | 3 | Files shortcuts (Escape/Delete), session-persistent bulk selection, Ctrl-K. No global command palette beyond search. |
| H8 Minimalist | 2 | Console and dashboard are dense-but-clean; the 11-item sub-nav and multi-modal legacy break minimalism. |
| H9 Recovery | 3 | Daemon-offline cards and error page are strong; stuck-banner risk + unnumbered confirms + unverified editor guard hold it back. |
| H10 Docs | 3 | docs/ are good (API.md, specsheet, addon docs); in-app contextual help is sparse — a tooltip pass would lift it. |

## Cognitive walkthrough — incident flow

**Task:** notice a down server → open it → diagnose → act → verify. Each step answered against the four questions (motivation / visibility / understanding / feedback).

| Step | Q1 | Q2 | Q3 | Q4 | Rating |
|---|---|---|---|---|---|
| Notice down on dashboard | ✅ status pill + label | ✅ card is obvious | ✅ offline = down | ✅ label + dot | **Pass** |
| Open the server | ✅ | ✅ card → manage | ✅ | ✅ page loads | **Pass** |
| Console loads (daemon up) | ✅ | ✅ console is the landing surface | ✅ | ✅ terminal + charts | **Pass** |
| Diagnose from logs | ✅ | ⚠️ log tail vs. tab unclear | ✅ | ⚠️ crash reason not guaranteed surfaced | **Hesitation** |
| Act (restart/reinstall) | ✅ | ✅ controls in header | ✅ | ✅ status transitions | **Pass** |
| Verify | ✅ | ✅ | ✅ | ✅ transition + dashboard | **Pass** |
| **Daemon is down** | ⚠️ | ✅ banner + retry | ✅ | ✅ retry + out-of-panel hint | **Pass** |

The arc only breaks where diagnosis depends on the operator knowing where the logs live and recognizing the failure — the exact gap /journey and /fortify target.

## Provision flow — task success estimate

- **Completion:** achievable; two manual/out-of-band steps are the structural risk.
- **Efficiency:** 8 steps, 2 outside the panel — the /journey proposal (surface daemon-config before saving the node) would cut the invisible-step failures.
- **Error/recovery:** install banner has named steps; failure naming + inline reinstall need /fortify confirmation.

## Positive findings (protect and replicate)

1. **Status always leads** — the thesis is true in the core: pills, dots, labels, resource cards, install steps.
2. **Destructive-action discipline** — double-confirm, Cancel-first, Escape, focus restore (`modal.ejs:78-100`). This is a pattern to codify as the standard.
3. **Ctrl-K global search** — grouped, fuzzy, recent history. Best-in-class for the domain.
4. **Daemon-offline degradation** — named banner + retry + boundary ("your account is unaffected") is the reference implementation.
5. **Accessibility floor is real** — skip link, focus traps, reduced-motion guards, aria-live toasts, ARIA comboboxes/tabs. The WCAG 2.2 commitment is implemented in the core, not just documented.
6. **Files bulk flow** — session-persistent selection, keyboard shortcuts, floating bar. The reference for every other bulk surface.

## Recommended actions (routed)

| Skill | Issues | Priority |
|---|---|---|
| **/fortify** | 1 (stuck-banner), 6 (editor guard), 9 (crash surfacing), 10 (numbered confirms) + empty/loading inventory | P1 first |
| **/organize** | 3 (grouped sub-nav), 7 (pagination), P3 (Overview/Dashboard) | P1 |
| **/localize** | 2 (deep-surface i18n) + coverage matrix | P1 |
| **/include** | 5 (alert() fallback), icon-only button sweep | P1 |
| **/transpose** | 8 (mobile More sheet + admin discovery) | P2 |
| **/articulate** | 10 (numbered confirms), error/empty copy library | P2 |
| **/journey** | 4 (first-run daemon config), incident diagnosis loop | P1 |
| **/blueprint** | CSP-nonce vs. addon-inline-JS tension, addon UI contract | P2 |

**Sequence:** fix the P1s as a tightening campaign — /fortify + /organize + /localize first (they are the "predictability at the edges" thesis), then /include and /transpose, then re-evaluate to verify.

## Limitations

This audit is static (code/views) — no live sessions. Severity 4 was not triggered in any finding. The editor-guard, crash-surfacing, and search-zero-state findings are **unverified** and explicitly flagged as verification targets for /fortify before they're treated as confirmed defects.
