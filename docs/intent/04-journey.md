# Intent · 04 · Journey

> End-to-end flows for the three highest-stakes operator jobs in Airlink Panel.
> Visual diagrams: `04-journey-provision.html`, `04-journey-incident.html`, `04-journey-files.html`.

---

## Problem statement

The /strategize thesis: operators arrive to *fix, provision, or verify* under pressure, and the panel should be "readable, compact, predictable under pressure." Three flows carry that promise:

1. **Provision something new** (admin or user) — 8 steps, 2 manual/out-of-band, and the adoption-critical path.
2. **Recover from failure** (owner or admin) — the incident flow where the panel must *lead with state* and never strand the operator.
3. **Manage files under bulk operations** — the deepest work surface, where the panel already does this best (the pattern to propagate).

Each is designed with: the user's mental model, the decision gates, the failure paths, device variants, and the copy/interaction specs the next skills must deliver.

---

## Flow 1 — Provision a server

### User context & variations
| Variation | Who | Entry | Difference |
|---|---|---|---|
| Admin provisions | Fleet operator, creates on behalf of others | `/admin/servers/create` | Picks owner + node + image + limits; full control |
| Owner provisions | Server owner, "new game server for me" | `/create-server` | Role-gated: only allowed images/nodes; no owner field |
| First-time self-hoster | Fresh install, zero nodes | Dashboard empty state CTA | Must first create a node + install a daemon — the adoption cliff |

### Screen-by-screen flow

**Current path (condensed from code):** empty state CTA → create-server form (node / image / docker / ports / allocations — a dense stepper) → submit → install banner (`installHeader.ejs`: WS lifecycle + polling, step list, progress) → server appears in dashboard with status pill.

**Step 0 — the empty-state fork (admin/first-run).** `views/admin/nodes/nodes.ejs` "No nodes yet" → CTA "Add a node". This is where adoption lives or dies. **Design decision:** the node-create form must show the full daemon-config story up front — not after the node is saved. Today the config appears in a "Configure" action after creation; the operator hits a dead end wondering "what do I do next." Rationale: the earlier an operator sees the out-of-band step ("copy this config, run this command on the node machine"), the less likely they are to abandon at the invisible step.

**Step 1 — choose who/what.** Owner-provision: image type is the first decision (it drives everything downstream: startup vars, resources, image). Admin-provision: node first (capacity), then image. **Design decision:** progressive disclosure — show only the fields the prior choice unlocks. The current form already does this per node/image selection; keep it, but validate inline (image requires startup var X → show the var, don't fail at submit).

**Step 2 — resource allocation.** RAM/disk/CPU. **Design decision:** show live budget context for admins (node's remaining capacity) so over-allocating is visible *before* submit, not rejected after. This is the "lead with state" principle applied to provisioning: the state that matters is the node's headroom.

**Step 3 — ports/allocations.** The `portsAllocator.ejs` modal already handles the mapping complexity well. **Keep as-is**; it is the reference for dense-but-predictable.

**Step 4 — submit → install lifecycle.** `installHeader.ejs` does this: banner with lifecycle steps, polling, progress. **Design decision:** make the *failure* path first-class, not an afterthought. On failure, show exactly which step failed and the retry entry point (reinstall lives in server settings today — it should also be offered inline at the failure point). Never leave the operator in "banner stuck at 72%."

**Step 5 — verify.** Server lands in dashboard with a status pill (installing → online/offline). **Design decision:** from the dashboard card, one click to console. The verify loop is: see online → open console → confirm it answers. Keep that two-tap loop obvious.

### Interaction specifications
- **Inline validation** on image fields (startup vars appear when required, not at submit).
- **Progress with step names** ("Pulling image… Creating container… Starting…") — not an abstract spinner. Already exists; keep.
- **Failure = named step + reason + retry action.** A stuck install banner is a Missing Feedback failure (anti-pattern catalog, High).
- **Undo/reversibility:** provision is not reversible (a container is created) — the honest frame is "reinstall" and "delete," both already gated by double-confirm in settings.

### Flow metrics
- Time from "create" submit to "online" status (the real success metric).
- % of creates that reach "online" on first attempt; % requiring reinstall.
- First-run adoption: does an empty state → first server complete in a single session?

---

## Flow 2 — Recover from failure (incident)

### User context
Owner or admin, server down, possibly *their* community on Discord already asking. Mindset: urgency, narrowed attention, zero patience for dead ends. The panel's job: show the state, get them to the diagnosis, let them act, confirm.

### Screen-by-screen flow

**Entry — the dashboard.** Server card shows offline (status pill + dot, never color-only). **Design decision:** the card for an offline server must telegraph *why at a glance* — offline vs. starting vs. suspended are different failure modes with different recovery actions. The status badge set (`online/offline/starting/stopping/installing/suspended`) exists; ensure "offline" is split in the operator's mind into "daemon unreachable" vs. "container crashed" — the card should hint at which.

**Step 1 — open the server → console.** `manage.ejs` renders the console with live charts, power controls, and (if daemon is down) an inline offline banner + Retry button. **Design decision:** this banner is the reference implementation — it names the problem ("Daemon connection lost"), offers the recovery ("Retry"), and never looks like a generic error. Propagate this exact pattern to files/backups/status pages (it exists in files already, in a slightly different form — unify).

**Step 2 — diagnose.** Console logs are the diagnostic surface. **Design decision:** when a container crash-loops, the panel should surface the *tail of the logs* on the console automatically, not require the operator to know the log tab exists. And the "last known reason" (e.g., "Out of memory," "Exit code 1") should appear as a status line, not be buried. This is lead-with-state applied to incidents.

**Step 3 — act.** Power controls (start/stop/restart) are in the console header. **Design decision:** destructive recovery (reinstall) stays in settings behind double-confirm — correct. Restart is cheap; keep it one tap. Between "restart" and "reinstall" there's a missing middle: **force-restart / kill**, which today may not exist distinctly. Verify in engineering (see pending questions).

**Step 4 — verify.** After start/restart, the status must visibly transition (starting → online) with the log tail proving it. **Design decision:** the console should auto-scroll to the *new* output after a restart so the operator sees the boot sequence begin. Silent restart = the operator re-clicks start = confusion.

### Failure-of-the-flow (the flow within the flow)
If the daemon is unreachable, the console, files, and power controls all degrade. **Design decision:** Tier-1 degradation must be *explicit*: the page says "This server's node is offline — you can't use the console right now," with the node's status and a retry. Never a spinner, never a silent failure, never a dead console. This is the Difference between graceful degradation and a broken tool.

### Multi-channel note
Incidents span channels: Discord (community) → panel → possibly the node's SSH. The panel can't control SSH, but the daemon-offline banner should state what the operator can do *in and out of the panel* ("Check the node's daemon service: `systemctl status airlink-daemon`"). Honest handoff out of the product is better than a dead end.

### Flow metrics
- Time from "noticed down" to "issued recovery action" (diagnosis speed).
- % of incidents resolved in-panel without SSH (the thesis metric).
- Error-to-retry loop: does the daemon-offline banner lead to a successful reconnect on first retry?

---

## Flow 3 — Manage files under bulk operations

### User context
Owner or subuser moving mods, configs, backups of a world — the file manager is where *real work* happens and where mistakes are costly (delete the wrong config, lose the world). Mindset: focused, sometimes tired, occasionally risky operations.

### Screen-by-screen flow

**Entry — files page.** `files.ejs` (1505 lines) is the deepest surface. It already has: tree/table, search filter, multi-select, floating bulk action bar, sessionStorage selection persistence, keyboard shortcuts (Escape clears, Delete bulk-deletes), inline editor.

**The selection loop.** Checkbox → select all → floating action bar appears → choose action → confirm → progress → verify. **Design decision — this is the reference flow.** It is the panel's best example of *predictability*: selection state persists across navigation, the bulk bar is discoverable but not in the way, destructive actions are gated, progress is visible.

**The confirm gate.** Bulk delete is gated (`window.modal.confirm`) and the modal focuses Cancel first (deliberate — prevents accidental Enter). **Design decision:** keep. Add the *scale* to the confirmation: "Delete 47 files? This can't be undone." The number makes the risk legible; without it, "Delete selected files?" is vague for a fleet-footed user who just selected 47 files.

**The progress → verify loop.** After bulk delete/archive: a progress toast/bar, then the list reflects the change. **Design decision:** on completion, show a success toast that names the count ("Deleted 47 files") and — where applicable — a recovery path ("Restore from backups"). Silent success is a Missing Feedback failure.

**The editor.** Single-file edit (`file.ejs`) with save. **Design decision:** the editor needs an explicit save/unsaved-changes affordance — a dirty-state indicator and a "you have unsaved changes" guard on navigate-away. Unknown today (pending question); this is a High-severity missing affordance if absent.

### Device variant
Mobile: the bulk bar already floats above the bottom nav — good. **Design decision:** on mobile, confirmations must be reachable by thumb (the sheet pattern, not a right-edge dialog); and selection should show a persistent count chip ("12 selected") since there's less visual room.

### Flow metrics
- Time to complete a 3-step bulk op (select → act → verify).
- Accidental-deletion rate (mitigated by the numbered confirm).
- % of sessions that use the bulk bar (is it discoverable? /investigate Q3 probes this).

---

## Cross-cutting interaction specs (for all flows)

- **Loading:** named-step progress (install), skeleton loaders (lists), never indefinite spinners on state that can be shown.
- **Feedback loops:** every mutation → immediate feedback (toast/sheet) → visible state change → where relevant, a recovery path.
- **Focus & keyboard:** console keyboard-first; files has shortcuts — document them for discoverability (a shortcuts hint exists? pending).
- **Reversibility:** delete/reinstall/revoke = gated + confirmed + numbered; restart/start = cheap, one tap.
- **Motion:** brief, state-driven, `prefers-reduced-motion` honored (already in DESIGN.md and implemented per the audit).

## Pending questions

1. Does a force-kill / kill action exist distinct from restart? *(Check `serverConsole.ts` power actions; /fortify and /specify confirm.)*
2. Does the file editor have a dirty-state / unsaved-changes guard? *(Check `file.ejs`; /fortify and /specify confirm.)*
3. Is the crash reason surfaced on the console automatically, or must the operator open logs? *(Check `manage.ejs` + daemon status fields.)*
4. Does the console auto-scroll to new output after a restart? *(Check `manage.ejs` scroll handling.)*
