# Intent · 07 · Articulate

> Voice framework, microcopy pattern library, error inventory, empty states, and a content model for Airlink Panel.
> Grounded in the existing voice (PRODUCT.md): "short, concrete, operational — calm, competent, practical."

---

## 1. Voice and tone framework

PRODUCT.md states the voice but doesn't operationalize it. This framework makes it decision-able.

### Product attributes → voice principles

| Attribute | Principle | Boundary (what it is / isn't) |
|---|---|---|
| Calm | **No drama, even when something's wrong.** State the fact, the stakes, the next step. | Calm, not cold. Reassuring, never "cute." |
| Competent | **Specific over vague.** Names, counts, and consequences. Operators trust precision. | Competent, not jargon-y. No internal terms. |
| Practical | **Every word earns its space.** Say what happened + what to do next, then stop. | Practical, not terse. Never a dead end. |
| Honest | **Informed consent on destructive acts.** Consequences named before the action, not after. | Honest, not fear-mongering. |

### Tone spectrum by context

| Context | Tone | Example |
|---|---|---|
| Idle / navigation | Neutral, brief | "Servers" / "Backups" — labels, not sentences |
| First-use / empty | Inviting, low-pressure | "No nodes yet. Add one to start hosting servers." |
| In-progress / loading | Factual, expectation-setting | "Pulling image (2 of 3)…" |
| Success | Warm, brief, concrete | "Deleted 47 files." not "Success!" |
| Warning / degraded | Clear, unalarmed | "Daemon connection lost — node-02 is unreachable." |
| Destructive confirm | Serious, specific, reversible-by-design | "Delete 47 files? This can't be undone." |
| Error / data loss | Direct, urgent, no panic | "Your unsaved changes will be lost." |

### Do / Don't

| Do | Don't |
|---|---|
| "Server won't start. Check the log tail below." | "An error occurred while processing your request." |
| "Deleted 47 files." | "Operation completed successfully." |
| "That doesn't look like an email address." | "You entered an invalid email." |
| "Reinstall keeps your world and config." | "Reinstall" (bare, consequences unstated) |
| "Copy this config, then run it on the node machine." | "Configure daemon" (the step nobody explains) |

---

## 2. Microcopy pattern library

**Confirm dialogs** (existing `modal.ejs` already does Cancel-first; unify the wording contract):
- Title names the action + the scope: `Delete 47 files?` / `Reinstall factions-survival?`
- Body states consequence + recovery: "This can't be undone. Restore from backups if needed."
- Confirm matches the verb: **Delete files** / **Reinstall server** — never "OK" / "Confirm."

**Success messages:** name what happened, name the count where it exists. `Deleted 47 files.` `Backup restored.` `Startup variable updated.` Suggest the next step only when it's genuinely next: `Restore from backups if needed.`

**Loading / progress:** named steps with position: `Pulling image (2 of 3)…` → `Creating container…` → `Starting server…`. The install banner already does named steps — the pattern extends to backups ("Uploading backup (3 of 7)…") and bulk operations ("Deleting files (12 of 47)…").

**Placeholders:** format/example, never the label alone. `MM/DD/YYYY` for dates; `minecraft` for a server name field; for search, `Filter files` (label + affordance). Never placeholder-only fields (a11y).

**Tooltips:** supplementary only, <150 chars, on hover AND focus. Never carry required instructions.

---

## 3. Error message inventory

The three-part contract: **what happened → why it matters → what to do.** Tone scales with severity.

| Trigger | Severity | Copy (en) |
|---|---|---|
| Node unreachable / daemon lost | Warning | "Daemon connection lost — node-02 is unreachable. Console, power, files, and backups for this server are unavailable. Your account and other servers are unaffected. Retry." |
| Install failed at a step | Error | "Install failed at 'Creating container' (step 2 of 3). The node may be out of disk or memory. Retry, or reinstall from server settings." |
| Container crash-loop | Warning | "Stopped 3 times in the last 5 minutes — exit code 1. The log tail suggests the world file failed to load. A reinstall preserves your world and config." |
| Upload too large | Validation | "File is 3 MB over the 25 MB limit." (specific size, specific limit) |
| API key shown once | Info | "This is the only time this key is shown. Copy it now." |
| Resource over-allocation | Validation | "This exceeds node-02's remaining RAM (4.2 GB free)." (admin context) |
| Session expired | Error | "Your session expired. Sign in again — your work is saved." |
| 404 / unknown route | Error | "We couldn't find that page." (errors/error.ejs already does this well) |

**Eliminate:** "An error occurred," bare codes in UI copy, blame framing ("you entered…"), cascading error walls.

**Localization flags:** none of the above contain date-relative words, idioms, or concatenated numbers — the pattern `Deleted {count} files.` must use pluralization keys per language (see content model).

---

## 4. Empty states

The empty-state component (`ui/empty-state.ejs`) already exists. The contract: **why it's empty + what to do.** Role-aware CTAs already correct (admin → create node/server; owner → create-server; subuser → "An admin will assign one to you.").

| Surface | Copy |
|---|---|
| No nodes (first-run) | "No nodes yet. Add a node to start hosting servers." — and because this is the adoption cliff, add the what-next: "You'll configure the daemon in the next step." |
| No servers (owner) | "No servers yet. Create your first one." / subuser: "An admin will assign one to you." |
| No backups | "No backups yet. Create one to protect your world." |
| No results (search/filter) | Never a bare "No results." → "No files match 'mods'." + clear-filter action. |
| Daemon offline (files) | Full-surface offline card (exists): "This server's node is offline. Files can't be loaded right now." + Retry. |

---

## 5. Content model

**String patterns (localization-ready):**
- `deleted_files`: `Deleted {count} files.` — must use ICU-style plural rules per language, not concatenation.
- `install_step`: `{step} ({position} of {total})…` — component order varies by language; keep as separate keys, never `'(' + n + ' of ' + m + ')'`.
- `offline_node`: `Daemon connection lost — {node} is unreachable.`
- `crash_loop`: `Stopped {count} times in the last {window}.` — count + window are data, rendered at display time, never date-relative.

**Character budgets:** confirm titles ≤ 60 chars; callout titles ≤ 70; callout text ≤ 220; success toasts ≤ 90; tooltips ≤ 150. German ~30% expansion is the ceiling driver — DESIGN.md's `rounded-xl` density is fine, but confirm buttons must accommodate longer verbs.

**Content lifecycle:** UI strings live in `storage/lang/{lang}/lang.json` (424+ keys, 10 languages). The audit (from /investigate, /localize) must find every hardcoded string in the deep surfaces and route it through `req.translations`. Client-side JS strings need a shared translation module, not scattered `window.translate()` calls.

---

## 6. Pending questions

1. Is there a singular/pluralization helper in the translation system today, or does `en/lang.json` handle counts via `{{count}}` keys? *(Engineering check → /specify.)*
2. Which hardcoded strings are client-side JS (toasts, validates) vs. EJS-renderable? *(The /investigate coverage audit answers this.)*
3. Does the existing `modal.ejs` wording contract match this pattern library, or is it divergent per call site (e.g., backups vs. schedules confirms)? *(Grep across call sites in /specify.)*
