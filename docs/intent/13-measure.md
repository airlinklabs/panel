# Intent · 13 · Measure

> Success metrics for the "Predictability at the edges" initiative and the day-to-day panel. Grounded in the /evaluate baseline (UX health 78), the /fortify P0/P1 list, and the /organize navigation thesis. Guarded against Goodhart: every business-facing metric has a paired user-outcome metric.

---

## 1. North-star and counter-metrics

| Metric | Definition | Why | Counter-metric (watch) |
|---|---|---|---|
| **Task completion under pressure** | % of "act on a down/failing server" sessions that reach a power/restart action ≤3 interactions from the console | The whole strategic thesis: predictability when it matters | Support tickets for "couldn't restart / lost data" — must fall, not rise |
| **Data-loss events** | Sessions where user work was lost (editor unsaved-nav, failed save, silent failure) | /fortify P0; nothing matters more than not destroying work | — |
| **Feature breadth** | Mean distinct deep-surface features used per active server-owner / week | Adoption of the surfaces we're tightening | Depth per surface (breadth without depth = busywork) |
| **Trust (CSAT)** | Post-interaction CSAT on the incident flow | Operators forgive slowness, not unpredictability | NPS trend (longer-horizon) |

**Ethical guard:** no metric here would improve by implementing a dark pattern. Task completion is measured on *real* user actions, never artificially lengthened sessions; data-loss is a user-outcome metric by definition. Dashboards show business + user outcomes side by side.

---

## 2. GSM map — the three bets

### Bet A: Grouped server sub-nav (/organize)
- **Goal:** Operators find deep surfaces without hunting; incident diagnosis is faster.
- **Signal:** Direct navigation to Files/Backups/Schedules from the console without using Ctrl-K or breadcrumbs; fewer stray clicks before an action.
- **Metric:** Median interactions to first deep-surface action ≥0.35 improvement vs. baseline 4; **time-to-Files** (dashboard → first file action) tracked as median, 80th percentile guarded.
- **Counter-metrics:** Ctrl-K search usage must not *increase* (if it does, nav grouping didn't help); help-request rate on "where is X" unchanged or down.
- **Baseline to capture before ship:** current median nav clicks per deep-surface entry (from logs: referrer → target).

### Bet B: Crash diagnosis (/fortify P1-2)
- **Goal:** An operator can tell why a server stopped within seconds, not log-hunts.
- **Signal:** Incidents where the last exit reason is visible without opening logs; restart-after-crash rate.
- **Metric:** % of crash-stop status cards that resolve to a stated reason within 5s of the crash event (daemon field present); **time-to-reason** median.
- **Counter-metric:** Restart-after-crash-without-reading-reason rate must not *increase* (we're not building a blind-rematch button).
- **Ethics note:** this metric is trivially gameable by always displaying "unknown" — the spec requires an honest "Stopped unexpectedly — open logs" fallback and a daemon-supplied exit code when available.

### Bet C: Editor unsaved-guard (/fortify P0-1)
- **Goal:** No operator work is ever silently lost in the file editor.
- **Signal:** Cancel-backed navigations on dirty editors; saves before exit.
- **Metric:** Dirty-edit sessions where `beforeunload` fired ≥1 → "saved then left" or "explicit discard" 100%; **zero silent-loss events** is the hard gate.
- **Counter-metric:** Save-without-edit (phantom saves) rate should stay ~0 — the guard must not add ritual saves.

---

## 3. Funnel analysis — the provision flow

| Step | Definition (event) | Risk | When to investigate why |
|---|---|---|---|
| 1. Start create | "New server" submit intent | — | — |
| 2. Node selected | Node chooser confirmed | **drop-off peak risk: out-of-band daemon step is invisible** | If <60% continue here, pair with /investigate sessions at the node screen |
| 3. Config accepted | Server row created | — | — |
| 4. Install started | Install banner appears | — | — |
| 5. Install completed | First "Started" status ≤24h | stuck-pull risk (/fortify P1-3) | If <75%, run qualitative at the install screen; check heartbeat data |
| 6. First server up | Start + connect | adoption of the value moment | If low, review first-run value-first recommendation |

**Segmentation:** new vs. returning operators; desktop vs. mobile (mobile has no install-detail parity); node type. Benchmark against the *previous release* funnel, not industry numbers.

**Pair-with-qual:** step 2 drop-off → session recordings; step 5 → support tickets during install.

---

## 4. A/B test plan — template (the restart-primary question)

Pending the /wireframe open question (Restart vs. Stop as primary power control):

- **Hypothesis:** If Restart becomes the primary power control (Stop demoted), then restart-to-stop usage ratio shifts toward restart on stopped servers without increasing accidental stops, because the dominant recovery action is restart.
- **Variants:** current (Start primary when stopped, Stop accent) vs. variant (Restart primary, Stop secondary).
- **Primary metric:** accidental-stop rate (stop issued ≤5s after start, then restart within 60s) — must not rise.
- **Guardrail metrics:** support tickets "oops I stopped it"; crash-after-restart rate; CSAT on incident flow.
- **Sample:** stop/restart actions are high-frequency — MDE 20% relative is achievable in ~2 weeks at panel scale. Use the sample-size table: baseline ~25% stop-rate → ~4,800 events per variant.
- **Duration:** 2 full weekly cycles (game servers are weekend-peaked); segment desktop/mobile.
- **Decision rule:** adopt if accidental-stop rate is not significantly worse AND restart usage on already-stopped servers improves ≥15%, else keep current.

---

## 5. Metrics dashboard spec

| Panel | Metrics | Frequency | Alert |
|---|---|---|---|
| **Health** | Data-loss events, silent-failure rate, error-page rate | Daily | Data-loss >0 → immediate |
| **Flow** | Incident task completion, time-to-reason, nav clicks to deep surfaces | Weekly | Regression >10% vs. prior |
| **Adoption** | Feature breadth, first-server-up funnel | Weekly | — |
| **Satisfaction** | CSAT on incident flow, NPS quarterly | Monthly / quarterly | CSAT drop >5pt → qualitative trigger |
| **Ops** | Daemon-offline sessions, WS error counts, install-abandon rate | Daily | Abandon >15% → investigate |

**Audience:** product (daily), eng (on alert), leadership (monthly). Business metrics and user-outcome metrics rendered side by side on every panel — the two-column ethical check.

---

## 6. Learning plan

- **Day 1:** instrument events (instrumentation is a /specify handoff). Capture provision + incident baselines *before* any fix ships.
- **Week 1:** verify telemetry (sampled logs vs. counter), check data-loss = 0.
- **Month 1:** first funnel + nav-click comparison vs. baseline; run A/B if scoped; CSAT wave 1 on incident flow.
- **Quarter 1:** NPS + SUS benchmark (SUS baseline is useful today: run a 10-question wave with current operators). Check Goodhart triggers; if task-completion rose but CSAT fell, reopen /strategize per the loop-back rules.

**Reopen triggers (per /intent):** (1) adoption data shows a "peripheral" surface (e.g., schedules) out-using Files → the tightening order is wrong; (2) incident completion improves but trust metric falls → the intervention traded predictability for friction; (3) data-loss metric rises despite the guard → engineering defect, stop and fix. Max one strategy reopen per iteration — beyond that, surface the tension to the user.

---

## 7. Handoff
- **/specify:** the event list (provision funnel, incident actions, nav clicks, dirty-editor events, data-loss flags) with payloads and where to log (existing activity system already logs `server:stop`, `server:restart`, etc. — extend, don't fork).
- **/investigate:** CSAT/SUS waves, session recordings at funnel drop-offs.
- **/strategize:** baselines feed the opportunity sizing from 01.
- **/fortify:** data-loss counter and silent-failure telemetry pair with its P0/P1 items.
