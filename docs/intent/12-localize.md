# Intent · 12 · Localize

> Localization readiness audit of Airlink Panel. The panel ships **10 locales** — en, es, ru, zh, it, fr, de, ja, ta, pt — with server-side string tables and a `req.translations.x || 'English'` fallback. That's a strong start; the audit finds the structure is i18n-ready but the **coverage stops at the deep surfaces**, and there are three hard-culture/technical defects to fix before expansion.

---

## Localization readiness checklist

| Requirement | Status | Evidence |
|---|---|---|
| Server-side string table | ✅ | `storage/lang/{en,es,ru,zh,it,fr,de,ja,ta,pt}/lang.json` |
| Locale routing | ✅ | `req.translations.*` per request |
| English fallback | ⚠️ half | `|| 'English'` fallback everywhere — graceful but **hides missing keys silently** |
| **Document language** | ❌ | `<html lang="en">` hardcoded — header.ejs:2, auth-header.ejs:6 |
| Coverage parity | ❌ | en = 425 keys; all others ≈ 343–350 (≈20% missing) |
| Client-side strings | ❌ | Deep-surface JS hardcodes English: 'File saved.', 'Failed to save file', 'Run schedule', 'Delete schedule' (schedules.ejs:750-766, subusers.ejs:346, file.ejs:392-395) |
| Client-side locale plumbing | ❌ | No `window.__lang`/`data-i18n` object found; server must inject a JSON blob for JS strings |
| Date/number/currency formatting | ❌ | `toLocaleDateString()` uses browser default, not the selected app locale (files.ejs:254 `new Date(file.modifiedAt).toLocaleDateString()`) |
| RTL support | ❌ | No RTL locale shipped (no ar/he); logical properties not in evidence |
| Plural handling | ⚠️ | ICU-style keys exist in /articulate content model; not yet applied to all strings |
| Text expansion tolerance | ✅ (structure) | Token-based fluid layouts tolerate ~30% expansion; must verify per-string budgets |

---

## Findings

### P0 — breaks the experience now

**1. `<html lang="en">` is hardcoded.** header.ejs:2. For every non-English user, screen readers announce English phonology for non-English text (bad for ta/zh/ja), and browser translation/autocomplete assumes English. **Fix:** `<html lang="<%= req.lang %>">` — one line, immediate correctness win. Audit auth-header.ejs:6 too.

**2. Coverage gap of ~20% in non-English locales.** en has 425 keys; es/ru/zh/it/fr/de/ja/ta/pt each ≈343–350. Every missing key silently renders the English fallback — which is exactly the "English appears at the moment of maximum stress" failure /evaluate flagged. **Fix:** make the CI check *fail on missing keys* (compare key sets against en), and run the pending translation pass on files/backups/schedules/console/manage/admin.

### P1 — structural

**3. Client-side strings are not localized.** Deep-surface JS hardcodes: file.ejs:392 'File saved.'/'Failed to save file'; schedules.ejs:750-766 'Run schedule'/'Delete schedule'; subusers.ejs:346 'Remove {name}'; backups.ejs:185 confirm bodies; the console's "Waiting for container...", "Server stopped", "Pulling image" (manage.ejs:794,1350-1352). **Fix pattern (matches /articulate content model):** server injects `window.__i18n = <%- JSON.stringify(req.translations) %>` (with only the keys JS needs), and JS reads `t('save.fileSaved')`. All keys in the existing tables; the mechanism is the work.

**4. Date/number formatting ignores app locale.** `toLocaleDateString()` (files.ejs:254) and similar run on the *browser* locale, which diverges from the selected panel locale (and is wrong for zh/ja/ta where the panel locale ≠ browser default). **Fix:** `toLocaleDateString(req.lang)` and a shared format helper; the server already knows `req.lang`.

**5. Missing locale fallback + directory name drift.** Store modal hardcodes `data-lang="en"` for addon content (store.ejs:730) — addon metadata will always be announced/styled as en. Addon i18n needs its own contract (see /specify addon section).

### P2 — forward-looking

**6. RTL readiness.** No RTL locale today; the audit found no `dir="rtl"` handling and no logical-property commitment in views. If Arabic/Hebrew/Farsi expansion is on the roadmap, retrofit cost rises linearly with every new view. **Recommendation:** adopt `inline-start`/`inline-end` and `dir` on `<html>` *now* as the default for new views; gate an actual RTL locale behind the /strategize market decision. Confirm the non-flipping set (port numbers, play/pause, terminal) explicitly.

**7. Cultural dimensions — no enforcement in copy.** Tone is already "calm, competent, practical" (/articulate) which suits low-context task-first operators. Two places to check with native reviewers: the informal suspend message ("This server's been grounded. Reach out to your admin if you think that's a mistake." manage.ejs:130) — grounded is idiomatic and won't translate; and the confirm copy that reads as American-casual. High-uncertainty-avoidance markets (de/ja) may want slightly more explicit confirmation framing — validate with /investigate, don't assume.

**8. Name/username handling.** Account + subusers assume email-based identity; names in addon author strings are formatted `by {author}` (store.ejs:532) — check for concatenation that breaks word order in ta/ja/zh. Use the `/articulate` ICU placeholder pattern everywhere.

---

## Market-specific requirement matrix (hypotheses for /strategize)

| Market | Tech i18n | Cultural | Compliance |
|---|---|---|---|
| **ES/LATAM** | ✅ ships | Formality: use "usted" tone in de settings; confirm currency/decimal (es has 1.234,56) | GDPR if EU (ES) |
| **PT (BR)** | ✅ ships | Informality OK; date dd/mm/yyyy | LGPD (Brazil) — consent flow |
| **JA** | ✅ ships | High-context: denser guidance, more confirmation; 24h time; YYYY/MM/DD; CJK line-break (no spaces) testing | JIS X 8341-3 a11y note |
| **ZH** | ✅ ships | Compact strings (test truncation, not expansion); dates 2026年8月2日 | PIPL if served to mainland — data residency is an architectural question, flag to /blueprint |
| **TA** | ✅ ships | Complex script shaping; text may expand; test rendering at small sizes | — |
| **RU** | ✅ ships | 24h time; pluralization (3+ forms); Cyrillic sorting | — |
| **DE** | ✅ ships | Text +30% expansion; formal "Sie"; high uncertainty avoidance → explicit confirms; comma decimal | GDPR |
| **FR/IT** | ✅ ships | dd/mm/yyyy, 24h; expansion ~20-30% | GDPR |
| **AR/HE (future)** | **needs RTL build-out (P2-6)** | High-context; right-to-left console/filenames | GDPR (if EU users) |

**Cross-market constants:** port/play/pause/send icons never flip; terminal and code stay LTR; numbers in ports never flip; `dir` at root, logical properties in new views.

---

## Localization test plan

1. **Key-parity CI gate** (P0-2): diff every locale key set against en; fail build on missing keys. Also lint for hardcoded UI strings (English literals in `.ejs` visible text and in JS `showToast('...')`/`confirm('...')`).
2. **Pseudo-localization** at 150% string length against every layout (finds truncation); run before any real translation of the new deep-surface keys.
3. **Linguistic QA in context:** native speakers reviewing the *translated UI*, especially console status labels, error messages, confirm dialogs (the /articulate error contract strings).
4. **Functional:** set panel to ja/zh/ta → verify CJK/Tamil line-breaking, name truncation, `toLocaleDateString` correctness, sorting (locale-aware collation in tables).
5. **`<html lang>` regression:** after P0-1, spot-check all 10 locales announce correctly (SR test).
6. **RTL (when scoped):** mirror test with real Arabic text + mixed-direction code/paths; logical-property audit of new views.
7. **Crowd test** per new market: unmoderated sessions on real devices (Android-dominant markets ≠ desktop QA).

---

## Handoff
- **/specify:** P0-1 (`<html lang>`), P0-2 (CI parity gate), P1-3 (window.__i18n injection), P1-4 (locale-aware formatter) — all small, high-value, non-breaking.
- **/fortify:** text-expansion budget, CJK/Tamil rendering edge cases, RTL edge cases fold into its state/stress catalog.
- **/articulate:** plural keys (ICU-style) and placeholder contracts for every new string; audit "grounded" idiom (P2-7).
- **/blueprint:** PIPL data-residency question for a mainland-China market; addon string/localization contract.
- **/strategize:** market prioritization for the RTL (ar/he) build-out.
- **/investigate:** native-speaker linguistic QA + cultural dimension validation for de/ja (formality, confirmation depth).
