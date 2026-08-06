# Baseline Behavior Matrix

Phase 1 deliverable. Static baseline from audit evidence (2026-08-06). No browser automation was run; entries marked (verify) need a live check.

Scale: OK / BROKEN / PARTIAL / UNKNOWN. Theme support and focus behaviors are static-analysis estimates.

| Page | Desktop | Tablet | Mobile | Overflow | Loading | Error surface | Dynamic content | Keyboard | Focus visible | Dark/light |
|---|---|---|---|---|---|---|---|---|---|---|
| dashboard | OK | OK | PARTIAL (folder DnD mouse-only; touch targets <44px) | PARTIAL (grid ok; popup overlays) | PARTIAL (skeleton/spinner, no empty-state standard) | toast + alert | fetch + inline DOM; no live polling | BROKEN (context menu right-click only; nested-interactive cards) | OK | OK |
| manage | OK | OK | OK (dedicated lg:hidden console, 2x2 stats) | PARTIAL (hardcoded chart limits; long log lines) | PARTIAL (loading popup, no skeleton) | P0 raw daemon errors (B-001) + toasts + terminal red lines | xterm + 3 WebSockets + charts; POWER ACTIONS PARTIAL (ownership bug B-020, idempotency B-021) | OK (console input) | OK | OK |
| files | OK | OK | PARTIAL (pagination 28px; col-hide missing) | PARTIAL (nested scroll in sheets) | PARTIAL (loading popup) | P0 daemon errors (B-003) | inline fetch-heavy; client pagination | OK | OK | PARTIAL (stray inputs B-063) |
| login | OK | OK | OK (full-height panel) | OK | none | ?err= whitelisted | inline validation | OK | OK | OK |
| register | OK | OK | OK | OK | none | ?err= whitelisted | inline validation | OK | OK | OK |
| server/settings | OK | OK | PARTIAL (stray inputs, nested sheets) | PARTIAL | loading popup | raw data.error toasts (settings.ejs:164+) | inline fetch; reload on reinstall/delete | OK | OK | PARTIAL (B-063) |
| server/backups | OK | OK | PARTIAL (nested scroll in create modal) | PARTIAL | loading popup | P0 daemon errors (B-004) | inline fetch | OK | OK | PARTIAL (B-063) |
| server/startup | OK | OK | OK | PARTIAL (hand-rolled pills) | none | toast | inline fetch | OK | OK | OK |
| server/file (editor) | OK | OK | PARTIAL | OK (paths break-all) | monaco load | raw toasts (file.ejs:467) | monaco | OK | OK | OK |
| admin/servers/edit | OK | OK | PARTIAL (nested sheets; ports listbox) | PARTIAL | loading popup | P1 admin leaks (B-008) | inline fetch + portsAllocator | OK | OK | PARTIAL |
| admin/overview | OK | OK | PARTIAL (2-up stat cards) | OK | none | toast | static + admin-overview.js | OK | OK | PARTIAL (wallpaper invert(1)) |
| admin/analytics | OK | OK | OK | OK | none | toast | chart.js fetch | OK | OK | OK |
| admin/nodes | OK | OK | PARTIAL (contrast B-060) | OK | loading popup | toast; P2 node leaks | fetch + inline | OK | OK | PARTIAL |
| admin/servers | OK | OK | PARTIAL (col-hide missing) | OK | loading popup | toast | admin-servers.js | OK | OK | PARTIAL |
| admin/users | OK | OK | OK (lg:hidden card list reference impl) | OK | loading popup | toast | admin-users-users.js | OK | OK | OK |
| auth (forgot/reset/2fa) | OK | OK | OK | OK | none | ?err= whitelisted | inline validation | OK | OK | OK |
| errors/error | OK | OK | PARTIAL (path truncate no break-all) | PARTIAL | none | P1 err.message in dev (B-009) | none | OK | OK | OK |
| api/docs | BROKEN | BROKEN | BROKEN (w-60 sidebar B-040) | P0 | none | none | none | OK | OK | OK |
| admin/mounts | OK | OK | PARTIAL | OK | none | toast | inline; no footer -> no motion | OK | OK | OK |
| user/server/schedules | OK | OK | BROKEN (task row B-042) | PARTIAL | none | raw toasts | inline CRUD | OK | OK | PARTIAL |
| user/server/worlds | OK | OK | OK | OK | none | toast (whitelisted server-side) | inline fetch | OK | OK | OK |

## Cross-page behavior summary

- Theme support: partial. Hardcoded active-pill identity (B-062) and Tailwind forms white inputs (B-063) break Solarized/Material/user themes and some dark-mode fields.
- Loading: consistent enough (loadingPopup + spinners), but no shared spinner primitive and no skeletons on list pages.
- Errors: toasts everywhere but they frequently carry raw server/daemon error strings; error page leaks `err.message` in non-production (B-009).
- Dynamic content: dashboard + server pages are fetch-driven with inline script; manage is the only real-time page (3 WS). No page uses the SPA `al:navigated` hooks; everything hard-navigates.
- Keyboard/focus: modal trap + focus restore good; dashboard organization dead for keyboard; ~40 unlabeled inputs.
- Motion: `data-animate` layer inert; checkbox spring not reduced-motion gated; duplicate animation owners.
