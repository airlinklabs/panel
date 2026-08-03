# Intent · 02 · Investigate

> Research plan, instruments, and synthesis protocol for Airlink Panel.
> Feeds the open questions from /strategize with a method for answering each.

---

## Research objective

Answer the three open questions from the strategic frame, plus the one the strategy depends on most:

1. **Q1 (adoption):** What is the real time-to-first-server experience for a self-hoster, and where does it break? *(First-run completion is unknown — there is no telemetry.)*
2. **Q2 (i18n):** Are non-English users actually using the 10 shipped languages, and where do they hit untranslated surfaces? *(i18n is front-loaded: nav/account translated, deep work surfaces hardcoded English.)*
3. **Q3 (operator-under-pressure):** When an admin or server owner is in an incident or a bulk operation, what do they reach for, what breaks, and what do they work around?
4. **Q4 (addons):** What is the addon ecosystem's quality expectation — do addon views break the shared component vocabulary, and does anyone notice?

Constraint that shapes everything: **this is self-hosted OSS with no product telemetry.** Recruitment happens through the Discord server (discord.gg/ujXyxwwMHc), GitHub issues/PRs, and the docs site. Evidence will be qualitative-first; prevalence claims must be labeled as such.

---

## Method selection (one per question)

| Question | Primary method | Why this method | Sample |
|---|---|---|---|
| Q1 adoption | Usability test on fresh-install → first server | The failure is behavioral and observable; we can provision a test panel | 5 participants/round |
| Q2 i18n | Coverage audit (code) + diary/observation with 2-3 non-English users | Half the evidence is static (which strings are hardcoded); half is behavioral | 3 non-English users, 1 week |
| Q3 operator pressure | Contextual inquiry + interview | We need in-situ workflows and workarounds, not self-reports | 6 interviews (3 admin, 3 owner) |
| Q4 addons | Developer interviews + artifact audit | Ecosystem quality is a making-side question | 3 addon authors + code review |

Supporting quantitative layer: a **community survey** (Discord + GitHub) sized for directional prevalence on pain frequency, not statistical confidence. This is the only prevalence instrument available given no telemetry.

**Trade-off made explicit:** We are choosing depth over breadth. Six interviews + five usability tests + three developer interviews will reveal *patterns*; the survey reveals whether those patterns are *common*. Both are labeled as such. No finding from a small sample is ever presented as a statistic.

---

## Study A — Usability test: fresh install to first server (Q1)

### Test objective
Can a self-hoster go from a blank install to a running game server without losing faith? Measure task completion, time, and emotional response across: configure panel → create node → configure daemon → create server → start server → see it online.

### Participants
- Self-hosters who have installed the panel in the last 60 days (from Discord) — or, if none available, people who have self-hosted any panel (Pterodactyl/WISP) as a recruiting proxy.
- 5 per round, 1 round now, 1 round after fixes (Nielsen/Landauer: 5 catches ~85% of issues).

### Tasks (scenario-based, not instruction-based)
1. "You just installed the panel on a fresh machine. Get to the point where you can log in as an administrator."
2. "Add a machine to host servers on." *(Success: node created AND daemon configured — watch where the daemon key/connection friction lives.)*
3. "Provision a game server for yourself and start it." *(Success: server shows online in the dashboard.)*
4. "The server won't start. Figure out what's wrong." *(Success: they reach the console logs and can read the failure — or we learn why they can't.)*
5. "Restart it and verify it comes back." *(Success: status transitions observed.)*

### Metrics
Task completion (pass/fail/partial), time-on-task, error rate, issue severity (1-4 per framework), satisfaction (one 5-point question per task), observed emotional state at each fail point.

### Session structure
Welcome → consent + recording → warm-up ("how do you run game servers today?") → tasks 1-5 with think-aloud → debrief ("what surprised you? what would you change?") → close.

---

## Study B — Non-English usage (Q2)

### Coverage audit (static, do first)
- Script: scan `views/**/*.ejs` for hardcoded English UI strings vs. `req.translations.*` usage. The exploration already found the split: server-side strings translated; client-side JS strings and deep-work page labels hardcoded.
- Deliverable: a coverage matrix per surface (account = 100%, files = ~X%, schedules = ~Y%...) that /localize will consume.

### Diary study (behavioral)
- 3 participants who use the panel in a language other than English (recruit from the translated-language communities; the Discord has international channels).
- 1 week: log every time they hit untranslated UI while doing real work (files, backups, console). One entry per encounter: what they were doing, whether they understood it, whether they fell back to English or gave up.
- This directly measures the "meets the product in English exactly where the work is hardest" hypothesis.

---

## Study C — Operator interviews (Q3)

### Participants
- 3 administrators (run nodes, manage many servers) and 3 server owners/subusers (live in one server), recruited from Discord.
- 45-60 min each, remote (screen share optional for artifact walkthrough).

### Interview guide (abridged)

**Study context:** We're exploring how people actually run game servers day-to-day — what's easy, what's in the way, what they've worked around. There are no wrong answers and we're not testing you.

**Opening (5-10 min)**
- Tell me about your setup — how many servers, how many machines, who else uses them.
- How did you end up running a panel instead of managing servers by hand?

**Theme 1: The last incident (Q3 core)**
- Walk me through the last time a server was down and you had to fix it. What did you do, step by step?
- Probe: What did you check first? What did you have open in other tabs? Did you restart, dig through logs, edit files? What was the worst part?
- Probe: What did the panel show you at that moment? Was it enough?

**Theme 2: Provisioning**
- Think about the last new server you created. Walk me through it.
- Probe: Where did you spend the most time? What did you have to go look up elsewhere?

**Theme 3: File work and bulk operations**
- How do you manage files on a server? When was the last time you did something to more than one file at once?
- Probe: Walk me through the last bulk action. Did anything feel risky? Did you check anything before confirming?

**Theme 4: Tools and workarounds**
- What do you reach for outside the panel — SSH, file clients, spreadsheets, notes?
- Probe: What does that tool give you that the panel doesn't? What would have to change to stop reaching for it?

**Closing**
- What's the single thing that would make running your setup dramatically easier?
- Is there anything I should have asked about but didn't?

### Synthesis
Affinity mapping, bottom-up. Journey-based synthesis per participant (incident lifecycle: detect → diagnose → act → verify → remember). Look for the *surprise* clusters — workarounds are where the insight lives.

---

## Study D — Addon author interviews (Q4)

- 3 addon authors (from the marketplace registry / GitHub) — 30-45 min each.
- Guide core: "Walk me through how you built your addon's UI. How did you use the panel's components? What did you copy from panel views? What did you have to invent?" Followed by an artifact audit: does their addon's view match the shared vocabulary (`.al-card`, `.al-btn-*`, status badges, sheets) or does it introduce its own look?
- Hypothesis to validate: **component reuse is a function of documentation + template discoverability, not intent.** The panel's strongest contributors build the most divergent UI — because there is no public component reference for addon authors to copy.

---

## Study E — Community survey (prevalence layer)

- Target: 100+ responses from Discord + GitHub + docs site visitors.
- Instrument rules followed: screener first (are you an admin, owner, or just browsing?), most important questions in first third, max 2 open-ended, no leading or double-barreled questions, randomized options where order matters, 5-point Likert with midpoint.

### Survey skeleton (abridged)
1. Screener: role, servers hosted, panel(s) used.
2. "In the last month, how often did a server go down when you weren't already watching it?" (Never/Rarely/Sometimes/Often/Constantly)
3. "When a server won't start, where do you go first?" (Console logs / Files / Settings / Restart / Elsewhere)
4. "Have you ever had to use a tool outside the panel to finish something the panel started?" (Yes/No) → if yes, open-ended: what were you doing?
5. "What language do you use the panel in?" + "Have you encountered untranslated screens?" (for non-English)
6. Rate: "The panel gives me enough information to know what went wrong" (Likert).
7. Rate: "I trust the panel enough to do destructive actions without double-checking" (Likert, reverse-keyed item included).
8. Open: "The one thing that would make the panel dramatically easier to operate."

### Evidence grading
Every survey finding is tagged with n. No prevalence claim without it. Cross-reference with interview themes: if 4 of 6 interviewees describe the same workaround and 70% of survey respondents (n≥80) also report related friction, that is **strong** (triangulated, two methods). Single-method signals are **moderate/weak** and labeled as such.

---

## Timeline

| Week | Activity |
|---|---|
| 1 | Static i18n coverage audit; recruit Studies A/B/C/D; pilot test usability tasks with a teammate |
| 2 | Usability round 1 (5); 3 interviews |
| 3 | 3 interviews; 3 addon-author interviews; diary starts (non-English users) |
| 4 | Diary closes; usability round 2 if fixes landed; survey launches |
| 5 | Survey closes (n target); synthesis (affinity + thematic analysis) |
| 6 | Findings report + handoff to /strategize, /journey, /localize |

## Deliverables

1. **i18n coverage matrix** (feeds /localize, /articulate)
2. **Usability findings report** (feeds /journey, /fortify, /evaluate)
3. **Operator interview synthesis** with insight statements — [Observation] + [Inference] + [Implication] — each tagged with evidence strength (feeds /journey, /blueprint)
4. **Addon UI audit** (feeds /blueprint, /specify)
5. **Survey report** with sample sizes (feeds /measure, /strategize)

## Research ethics

- All participants recruited voluntarily from public community channels; incentives offered as small thank-yous proportional to effort (a test round ≈ a survey; interviews get more than surveys).
- Informed consent up front: what the study is for, that sessions are recorded, that they can stop anytime, that data is anonymized (participant codes P1-P6, no usernames in reports).
- Raw recordings deleted on a defined schedule; quotes only with permission to quote.
- No vulnerable population is targeted; game server operators are adults with technical agency. Still, interviewers watch for fatigue during long incident walkthroughs and offer breaks.
- Reporting responsibility: negative findings (e.g., "the create flow actually works fine," "users don't care about translation gaps") are reported with the same weight as positive ones.

## Limits & open questions

- No telemetry means no true behavioral prevalence; the survey is the ceiling of what we can claim. If the panel later ships optional, privacy-respecting analytics (opt-in), /measure should revisit.
- Self-hosting installs are heterogeneous (bare metal, VPS, Docker, different distros). Usability round 1 will tell us whether that variance needs segmenting in round 2.
- The addon author sample (n=3) is the thinnest evidence in the program; findings are directional.
