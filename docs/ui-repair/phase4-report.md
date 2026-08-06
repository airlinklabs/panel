# Phase 4 Report — manage.ejs live no-reload operations

**Status:** COMPLETE — validation gate passed. Auto-proceeding to Phase 5 after a 10s pause per coordinator instruction.

## Scope

Fix the manage.ejs live-data/interaction ledger (B-020..B-029): console ownership, power-action idempotency, single status writer, rAF-batched charts, real disk limit, socket teardown, fetch abort/sequencing, and removing full-page reloads from the retry/install/EULA flows on the manage page. No src/ backend changes.

## Bugs fixed (ledger statuses updated)

- **B-020 (P0)** console ownership: `visibilitychange` listener, `updateConsoleOwnerUI`, and the `navigator.locks` acquire IIFE were nested inside the reconnect `setTimeout`, so on a healthy first load `consoleOwner` stayed false (input silently refused commands) and every reconnect re-registered listeners. All hoisted to top level; `connectWebSocket()` is now invoked exactly once at page init.
- **B-021 (P0)** power-action idempotency: `setButtonLoading`/`clearButtonLoading` now set `btn.disabled = true/false` so a double-click can't fire two POSTs, two event sockets, or two poll intervals.
- **B-022** duplicate status writers: `setAllStatsOffline` now skips the status card/chart while `lifecycleActive` (the lifecycle stream owns it during start/stop/install); `surfaceStoppedState` no longer re-blanks the card on every repeated `running:false` snapshot (it only writes the card when there is a crash reason; the "Open logs" link is always kept).
- **B-023** unthrottled chart updates: `updateChart` now schedules via a shared `requestAnimationFrame` (one `chart.update()` per frame across all dirty charts) instead of one update per stats message.
- **B-024** hardcoded disk limit: `updateDiskUsage` and `setAllStatsOffline` read the real `server.Storage` (render context passes it); `0` = unlimited disk.
- **B-025** lifecycle socket leak: the passive events socket was a bare IIFE with no close/reconnect. It is now `connectLifecycleSocket()` — assigned to a tracked `lifecycleSock`, reconnects on drop (3s), closes on `visibilitychange` hide, and a `teardownPage()` on `beforeunload`/`pagehide` closes console/stats/lifecycle sockets, cancels reconnect timers + fade timer + pending rAF, and aborts in-flight log fetches.
- **B-026** no abort/sequencing: `loadRecentLogs` creates an `AbortController`, supersedes any older in-flight load, and swallows `AbortError`; the console history fetch is abortable; the lifecycle `stopped/killed` branch now reuses `loadRecentLogs(false)` instead of a second, duplicate `/logs` fetch that re-appended everything to the terminal.
- **B-029** reload dependence: the two daemon-offline "Retry" buttons now call `retryDaemonConnection()` (reopens console/stats/lifecycle sockets in place; `setDaemonOfflineBanner` also toggles the mobile banner, which it previously ignored). installHeader's `markDone` and reinstall path reconnect in place on the manage page (detected via `window.retryDaemonConnection`) and hide/re-arm the banner; EULA accept no longer reloads. Non-manage pages that include installHeader (backups/files/worlds/subusers/startup/settings) keep the reload fallback — they have no socket plumbing to re-init.

## Additional live-data gap fixed

The mobile stats grid (`mobile-ramUsage`, `mobile-cpuUsage`, `mobile-diskUsage`, and the mobile charts) had been wired with captured "originals" that were never reassigned — the cards sat at static `0%` / `--` forever. The mobile IIFE now patches `updateRamUsage`/`updateCpuUsage`/`updateDiskUsage` to mirror the desktop values and feed the mobile charts, so the mobile 2x2 grid is genuinely live.

## Files changed

`views/user/server/manage.ejs`, `views/components/installHeader.ejs`, `views/components/serverFeatures.ejs`, `docs/ui-repair/{bug-ledger.md,ownership-map.md}`.

## Validation

- EJS compile check over all 75 views — OK (0 bad).
- `node --check` on extracted inline scripts for manage, installHeader, serverFeatures — OK.
- `tsc` typecheck (all 3 configs) — OK.
- `vitest run` — 224/224 pass.
- Tailwind build (`tw.css → styles.css`) — OK (v4.3.3).
- Impeccable detector over `views` + `public` — 0 findings.
- `eslint src` — unchanged pre-existing errors only (0 src files modified in this phase).

## Intentional behavior changes

- Daemon-offline retry and install-complete/reinstall no longer reload the manage page; sockets reconnect in place. If the daemon is genuinely down the retry path fails and the offline banner re-appears after the console socket's error threshold.
- The lifecycle `stopped/killed` handler now loads the saved log history (via `loadRecentLogs`) instead of re-fetching `/logs`; terminal content is no longer duplicated on every stop.
- Non-crash stops (no exit code) surface as `Offline` + an "Open logs" link rather than an empty/blanked status label.
- Repeated install status polls no longer apply out of order — a newer log load supersedes an older one.

## Remaining risks / deferred

- **B-027** (dead SPA hooks) and **B-028** (duplicate `/power/restart` route) untouched this phase — both P2; B-028 needs a src/ change.
- installHeader non-manage pages still reload on install complete (documented fallback).
- The disk doughnut chart is not rendered while the disk limit is `0` (unlimited); the text card shows "used (unlimited disk)".
- `serverStopped`/`deliberateStop` interplay is unchanged; crash-vs-stop surfacing (S-2) was already in place and is preserved.

## Next phase readiness

Phase 5 (backend error-message sanitization, B-001..B-012 / error envelopes) is next; it will be the first phase that touches `src/`. Running after the 10s auto-continue trigger.
