# Intent · 01 · Strategize

> Strategic framing for Airlink Panel (Katharos), produced by the Intent sequence.
> Situation → complication → resolution. Evidence-grounded; open questions are named, not hidden.

---

## Situation

Airlink Panel is a self-hosted, open-source game server management panel: Express + EJS + Tailwind, Prisma/SQLite, a daemon-based node architecture, HMAC-signed daemon communication, 138 REST routes, 4 WebSocket endpoints, a client API, and a first-class addon system. It is in beta but operationally complete — the admin and user surfaces, per-server management (console, files, backups, schedules, databases, subusers), analytics, API keys, and i18n (10 languages, 424+ keys) all exist and are maintained by an active team with real security discipline (SRI hashes, Semgrep SAST, CSP with nonces + strict-dynamic, DOM-purify pinning, IP bans, rate limiting).

The team already holds the right design commitments, codified in PRODUCT.md: lead with state, keep controls explicit, high density with legible hierarchy, one component vocabulary across screen sizes, accents reserved for meaning. WCAG 2.2 AA is the stated target for authenticated screens.

## Complication

The dominant open-source game server panel — Pterodactyl and its fork Pelican — occupies the space Airlink wants. Pterodactyl's moat is *distribution and trust*: it's the default answer, has a decade of docs, and a huge community. Airlink's moat candidates are *architecture and safety*: a modern addon system, a client-facing REST API, daemon HMAC auth, and a genuinely strong accessibility posture. But three tensions are visible from the code alone:

1. **The operator-under-pressure promise is not uniformly delivered.** The console (`manage.ejs`, 1650 lines), files (`files.ejs`, 1505 lines), and schedules (862 lines) are deep, dense tools. Dense is fine — but the density has to be *predictable*, and several pages carry their own bespoke patterns (two competing modal systems, per-page toast re-instantiation, hand-rolled pagination). Predictability under pressure is the product thesis; fragmentation undercuts it.

2. **i18n is front-loaded but not carried through.** Navigation, headers, and account flows are translated; the deepest work surfaces (files, backups, schedules, console controls, much of admin) are hardcoded English. For a product that ships 10 languages and competes on being *the* accessible panel, a user who picks their language meets the product in English exactly where the work is hardest.

3. **Adoption friction is concentrated at the edges.** First-run (zero nodes, zero servers) has empty states, but provisioning a server involves a long, dense create flow; node configuration requires copying daemon config out-of-band; and error recovery for the *worst* case (daemon offline, install failure) is good but not uniform. Competing with Pterodactyl means winning on time-to-first-server, not just feature parity.

This is not a manufactured complication sized to fit a redesign. It is a real, evidence-visible gap between the product's stated thesis ("readable, compact, predictable under pressure") and its uneven implementation. The resolution is not a redesign — it is a tightening campaign.

## Resolution

Do not re-platform, re-skin, or re-architect. Airlink's differentiator is that it is *operationally serious* — it does the security, the a11y, the i18n, the daemon model right. The strategy is to make that seriousness uniformly true, then make it legible to the market.

**Positioning:** "The game server panel that treats operators like professionals." Dense, predictable, accessible, honest. Compete on craft and trust, not neon.

**Strategic theme for this sequence:** *Predictability at the edges.* Systematically close the gap between the product's best moments (account, auth, dashboard, console) and its deep-work surfaces, so that the whole product holds the same standard under pressure.

## Goals

- **User goals:** An operator under pressure (incident, provisioning, failure) can verify state and complete the fix without searching for controls or losing context. A non-English-speaking operator gets a fully translated deep-work surface, not a partial one. A keyboard/screen-reader user can operate every surface, including bulk file actions and console.
- **Business goals:** Shorter time-to-first-server for new installs. Lower perceived complexity (fewer, more predictable patterns). Trust signals that make Airlink the *rational* alternative to Pterodactyl.
- **Strategic intent:** Fix pattern fragmentation, finish i18n in deep surfaces, harden failure recovery, then surface this as marketable discipline.

## Constraints

- **Timeline:** Open-source beta; no hard external deadline. Work should be incremental and non-breaking — this is a living product with addons that depend on its contracts.
- **Technical:** Express + EJS server-rendered; Tailwind utility CSS; global component system via EJS includes; addon system that depends on stable layout contracts. Any change must not break the addon API.
- **Organizational:** Small core team, open-source contributor model. Changes must be legible to contributors (docs-driven) and reviewable.
- **Regulatory:** Self-hosted OSS; GDPR-relevant only in that the panel stores account data. The panel's own posture (secure defaults, CSP, 2FA) is the compliance story.

## Guiding Principles

1. **Predictability over novelty.** One component vocabulary everywhere; if a surface does something differently, that's a bug to fix, not a local style.
2. **Lead with state.** Health, warnings, and action outcomes are always the most visible thing on a surface.
3. **Finish the commitments.** If it's translated in the account page, it's translated in the file manager. If it's keyboard-reachable in the console, it's keyboard-reachable in schedules.
4. **Honest friction.** Destructive actions stay gated; urgency is never manufactured; status never relies on color alone.

## Key Assumptions & Open Questions

- **A:** The two populations (admin vs. server owner) don't need separate products — they need the same product at different privilege levels. *(Validated by current architecture: same shell, different menu items.)*
- **A:** Operators are most valuable on desktop; mobile is a monitoring/quick-action surface. *(Validated by dual-layout console: full tools on desktop, status-first on mobile.)*
- **Q:** What is the actual first-run completion rate for self-hosters? *(Unknown — no telemetry. Recommended research target.)*
- **Q:** Are non-English users actually using the 10 shipped languages, and where do they bounce? *(Unknown. i18n coverage audit in this sequence addresses the design side; usage data needs /measure.)*
- **Q:** What is the addon ecosystem's quality expectation? Addons can ship their own views and break the component vocabulary. *(Open. Relevant to /blueprint and /specify.)*

## Proposed Scope (this sequence)

- `/blueprint` — map panel ↔ daemon ↔ browser trust and data flows; document fail points.
- `/journey` — design the three highest-stakes flows: provision-a-server, recover-a-failed-node, and manage-files-under-bulk-operations.
- `/organize` — audit navigation/IA against the two user populations; propose taxonomy fixes.
- `/wireframe` — normalize deep-work surfaces onto the shared component vocabulary.
- `/articulate` — voice + microcopy pass across error/empty/confirm states; i18n key coverage plan.
- `/evaluate` — scored audit against PRODUCT.md principles and the Intent anti-pattern catalog.
- `/fortify` — failure-mode hardening: daemon offline, install failure, permission edge cases.
- `/include` — verify the WCAG 2.2 AA commitment against the deep surfaces.
- `/transpose` — audit desktop/mobile parity across deep surfaces.
- `/localize` — i18n architecture and coverage roadmap.
- `/measure` — define success metrics for the "operator under pressure" thesis.
- `/specify` — engineering handoff: prioritized, legible, non-breaking.

## Anti-patterns explicitly refused

No Prechecked Consent, no Privacy Zuckering, no Fabricated Scarcity, no Confirmshaming, no Notification Spam, no Inaccessible Unsubscribe. The panel is a professional tool for professionals; its integrity is its product.
