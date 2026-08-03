# Intent · 06 · Wireframe

> Mid-fi structural wireframes for the panel's deep surfaces.
> Artifact: `06-wireframes.html` (self-contained viewer — grid/slideshow, light/dark).

---

## Screen inventory (7 frames, 3 sections)

| # | Frame | Rung | Job |
|---|---|---|---|
| 1 | Console — healthy | mid-fi (1440) | Verify state, then act |
| 2 | Console — daemon offline | mid-fi (1440) | Tier-1 degraded: name it, bound it, exit honestly |
| 3 | Console — crash diagnosis | mid-fi (1440) | Lead with the failure reason, offer the fix inline |
| 4 | Files — selection + bulk bar | mid-fi (1440) | The reference bulk flow |
| 5 | Files — numbered confirm | mid-fi (1440) | Honest friction on irreversible bulk delete |
| 6 | Server nav — grouped, desktop | mid-fi (1440) | /organize proposal rendered |
| 7 | Server nav — grouped, mobile | mid-fi (390) | Group-aware mobile nav |

## Structural rationale

**Console (1-3).** Zone anatomy: appbar (identity + state + power) → resource cards → terminal. The state band is topmost and leftmost because that's where a pressured operator looks first (top-left primacy). The power controls cluster right — but note: in frame 1 Stop is the accent (primary). That's a decision to verify — Stop is destructive-ish but it's also the recovery from "crashing." /evaluate should weigh whether Restart (the most common incident action) should be primary instead. Marked as an open question in the notes rail.

Frame 2 is the /blueprint Tier-1 degradation contract rendered: an error callout that *names* the daemon + node, a bounded "what's blocked vs. what still works," a Retry action, and an honest out-of-panel hint (the daemon service command). No spinner, no dead end.

Frame 3 is lead-with-state for incidents: the failure reason ("Exit code 1," "3 times in 5 minutes") is a status line above the log tail, and Reinstall is offered inline — framed honestly ("preserves your world and config") so it's an informed choice, not a scary button.

**Files (4-5).** The bulk bar is sticky-bottom, accent-filled, with a live count chip. Delete is the strongest visual action but the confirmation modal (frame 5) is where the weight lands: number ("47 files"), irreversibility, and the recovery path ("Restore from backups"). This mirrors the existing `modal.ejs` Cancel-first behavior — the wireframe is a normalization of what the code already does best, per the strategy theme "predictability at the edges."

**Server nav (6-7).** The /organize grouping rendered both ways. Desktop: group headers with accent-soft active state (state visible without color alone). Mobile: groups become tabs, members render as a list under the active group — replacing the 11-item horizontal scroll. The bottom rail keeps Home/Servers/Files/More; the More sheet must mirror the group taxonomy (flagged in notes).

## Annotations recap (decisions, not inventory)

1. Console: state leads — identity + status + resources before controls.
2. Console: power hierarchy is an open question (Stop vs Restart as primary).
3. Degraded state: the failure names itself (daemon + node), never "an error occurred."
4. Degraded state: boundary is explicit — what's blocked, what still works.
5. Degraded state: honest out-of-panel exit provided.
6. Crash: failure reason is a status line; reinstall offered inline with honest framing.
7. Bulk bar: live count chip makes risk legible.
8. Confirm: number + irreversibility + recovery path; Cancel first.
9. Grouped nav: /organize proposal; addons slot into groups.
10. Grouped nav: mobile groups-as-tabs; More sheet mirrors taxonomy.

## Considered & rejected

- **Rejected: hiding degraded surfaces.** Frame 2 keeps the console visible with an explicit blocked-state rather than replacing it with a generic error page — a dead end was the anti-pattern being refused (Missing Feedback / Dead Ends).
- **Rejected: one big modal on console for "daemon offline."** A modal would block the panel's own guidance; the inline callout keeps the rest of the surface usable.

## Handoffs

- **→ /articulate:** all copy in these frames is provisional — the callout titles, confirm text, and empty/gate labels need the voice pass and i18n keys (frame 2's copy especially: it must survive translation).
- **→ /fortify:** the frames assume states worth verifying — reinstall-preserves-world, offline banner on *every* deep surface, crash-count tracking. /fortify owns the truth of those states.
- **→ /evaluate:** the power-control hierarchy and the accent-on-Stop question are evaluation targets.
- **→ /specify:** when structure freezes, frames 1-7 become handoff specs with the interaction states (focus, disabled, dead-tap) already modeled.

## Pending questions

- Should Restart (not Stop) be the primary power action on a live console?
- Does reinstall genuinely preserve world/config — the confirm in frame 3 promises it?
- Is the offline state rendered identically across console/files/backups today, or is `files.ejs`'s offline card a one-off?
