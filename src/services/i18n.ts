/**
 * Blazing-fast i18n translation service.
 *
 * Architecture:
 *   - Language files live in storage/lang/{lang}/lang.json
 *   - Flat key-value pairs with dot-notation namespaces
 *   - In-memory Map cache — loaded once per language, never re-read
 *   - Tag interpolation: "Hello {{name}}" → t('greeting', { name: 'World' })
 *   - Fallback chain: user lang → en → raw key
 *   - Log language独立于 UI language (env LOG_LANG)
 *
 * Usage in handlers:
 *   req.t('adminOverviewTitle')                     → "Overview"
 *   req.t('greeting', { name: 'Alice' })            → "Hello Alice"
 *   req.tn('serverCount', count)                     → "1 server" / "5 servers"
 *
 * Usage in EJS templates:
 *   <%= t('adminOverviewTitle') %>
 *   <%= t('greeting', { name: user.name }) %>
 *   <%= tn('serverCount', servers.length) %>
 */

import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import logger from '../handlers/logger';

// ─── Types ────────────────────────────────────────────────────

type TranslationMap = Record<string, string>;
type PluralMap = Record<string, { one: string; other: string }>;

interface LangBundle {
  strings: TranslationMap;
  plurals: PluralMap;
}

// ─── Cache ────────────────────────────────────────────────────

const bundleCache = new Map<string, LangBundle>();
let initialized = false;

const LANG_DIR = path.join(__dirname, '../../storage/lang');

// ─── Loading ──────────────────────────────────────────────────

function loadBundle(lang: string): LangBundle {
  if (bundleCache.has(lang)) {
    return bundleCache.get(lang)!;
  }

  const langPath = path.join(LANG_DIR, lang, 'lang.json');
  const fallbackPath = path.join(LANG_DIR, 'en', 'lang.json');

  // English is the base for every locale: a locale only ships ~700 of the
  // ~2350 keys, and without this merge each untranslated key would render
  // as its raw camelCase identifier in the UI.
  // An entry whose value is '' means "not translated yet", not "render
  // nothing". Every non-English bundle currently ships 682-685 entries that
  // are all '' (placeholders), and spreading them over en after the fact
  // blanks ~682 strings per request — `?? key` never fires because '' is not
  // nullish, so the raw camelCase key leaks into the UI instead. Filtering
  // them out here leaves the English base in place, which is the intended
  // degradation until real translations land.
  const own = lang === 'en' ? {} : readJson(langPath) ?? {};
  const filteredOwn: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(own)) {
    if (key.startsWith('_') || (typeof value === 'string' && value === '')) {
      continue;
    }
    filteredOwn[key] = value;
  }
  const raw = {
    ...(readJson(fallbackPath) ?? {}),
    ...filteredOwn,
  };

  const strings: TranslationMap = {};
  const plurals: PluralMap = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) {
      continue;
    } // skip commentary keys
    if (
      typeof value === 'object' &&
      value !== null &&
      'one' in value &&
      'other' in value
    ) {
      plurals[key] = value as { one: string; other: string };
    } else if (typeof value === 'string') {
      strings[key] = value;
    }
  }

  const bundle: LangBundle = { strings, plurals };
  bundleCache.set(lang, bundle);
  return bundle;
}

const overrideCache = new Map<string, TranslationMap>();

/**
 * The locale's OWN entries only — no English merge (contrast loadBundle).
 *
 * This is what `window.__i18n` must serialise to in the browser:
 *   - `en` returns {} because client-side copy already falls back to an
 *     English literal (`window.__i18n.x || 'English'`), so serialising the
 *     140KB English catalogue would ship every byte a second time.
 *   - any other locale returns only its ~700 overrides (~16KB). Keys the
 *     locale has not translated are absent, so the same `|| 'English'`
 *     fallback renders English — which is the intended degradation.
 * Plural entries are objects, not strings; client copy never looks one up,
 * so they are skipped rather than serialised as `{one, other}`.
 */
function ownOverrides(lang: string): TranslationMap {
  if (lang === 'en') {
    return {};
  }
  const cached = overrideCache.get(lang);
  if (cached) {
    return cached;
  }
  const raw = readJson(path.join(LANG_DIR, lang, 'lang.json'));
  const out: TranslationMap = {};
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('_') || typeof value !== 'string' || value === '') {
        continue; // '' means untranslated — the JS `|| 'English'` fallback needs it absent
      }
      out[key] = value;
    }
  }
  overrideCache.set(lang, out);
  return out;
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Initialization ───────────────────────────────────────────

/**
 * Pre-load all available languages at startup.
 * Called once from app.ts — subsequent loadBundle() calls are instant.
 */
export function initI18n(): void {
  if (initialized) {
    return;
  }

  try {
    const langs = fs.readdirSync(LANG_DIR).filter((entry) => {
      const stat = fs.statSync(path.join(LANG_DIR, entry));
      return stat.isDirectory();
    });

    for (const lang of langs) {
      loadBundle(lang);
    }

    logger.info(
      logT('log.i18nLoadedLanguages', {
        count: bundleCache.size,
        langs: langs.join(', '),
      }),
    );
  } catch (error) {
    logger.error(logT('log.i18nFailedToInitialize'), error);
    loadBundle('en'); // ensure at least English works
  }

  initialized = true;
}

// ─── Tag interpolation ────────────────────────────────────────

/**
 * Replace {{tag}} placeholders in a string.
 *   interpolate("Hello {{name}}, you have {{count}} messages", { name: 'Bob', count: 5 })
 *   → "Hello Bob, you have 5 messages"
 */
function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return key in vars ? String(vars[key]) : `{{${key}}}`;
  });
}

// ─── Core API ─────────────────────────────────────────────────

/**
 * Get a translation string by key.
 * Supports tag interpolation via {{tag}} syntax.
 *
 *   t('greeting', { name: 'World' })
 */
export function t(
  lang: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const bundle = loadBundle(lang);
  const template = bundle.strings[key] ?? key; // fallback to key itself
  return vars ? interpolate(template, vars) : template;
}

/**
 * Pluralization helper.
 * Uses `one` / `other` forms based on count.
 *
 *   tn('serverCount', 1)  → "1 server"
 *   tn('serverCount', 5)  → "5 servers"
 */
export function tn(
  lang: string,
  key: string,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const bundle = loadBundle(lang);
  const plural = bundle.plurals[key];
  if (!plural) {
    return key;
  }

  const form = count === 1 ? plural.one : plural.other;
  return interpolate(form, { count, ...vars });
}

/**
 * Get the log language from env (independent of UI language).
 */
export function getLogLang(): string {
  return process.env.LOG_LANG || 'en';
}

/**
 * Log a translated message using LOG_LANG.
 */
export function logT(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return t(getLogLang(), key, vars);
}

// ─── Middleware ────────────────────────────────────────────────

/**
 * Express middleware that attaches translation functions to req/res.
 *
 * - req.t(key, vars?)     — translate using user's language
 * - req.tn(key, count, vars?) — pluralize using user's language
 * - res.locals.t          — same as req.t, available in EJS
 * - res.locals.tn         — same as req.tn, available in EJS
 */
export function i18nMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const lang = (req.cookies?.lang as string) || 'en';
  (req as any).lang = lang;

  // Bind req.t / req.tn with user's language
  (req as any).t = (key: string, vars?: Record<string, string | number>) =>
    t(lang, key, vars);
  (req as any).tn = (
    key: string,
    count: number,
    vars?: Record<string, string | number>,
  ) => tn(lang, key, count, vars);

  // Proxy so req.translations.someKey works in EJS templates.
  //
  // The `get` trap is the whole read path and is unchanged: any key resolves
  // through t(), which merges English underneath the locale.
  //
  // The other traps exist because the original Proxy had ONLY `get`, so
  // `JSON.stringify(req.translations)` enumerated no own keys and produced
  // `{}`. `layouts/base.ejs` and `layouts/auth.ejs` both do exactly that to
  // build `window.__i18n`, which meant every `window.__i18n.x || 'English'`
  // in client-side JS — 130 call sites across views plus shared search.js,
  // theme-init.js, files.js and logs.js — was permanently rendering English
  // in all 10 locales. Enumeration is deliberately scoped to the locale's own
  // overrides (see ownOverrides): `en` still serialises to `{}`, so the
  // default locale's payload and markup are byte-identical to before.
  const overrides = ownOverrides(lang);
  const overrideKeys = Object.keys(overrides);
  const overrideSet = new Set(overrideKeys);
  (req as any).translations = new Proxy(
    {},
    {
      get(_target, prop) {
        return typeof prop === 'string' ? t(lang, prop) : undefined;
      },
      ownKeys() {
        return overrideKeys;
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== 'string' || !overrideSet.has(prop)) {
          return undefined;
        }
        return {
          value: overrides[prop],
          enumerable: true,
          configurable: true,
          writable: true,
        };
      },
    },
  );

  // Expose to EJS templates
  res.locals.t = (req as any).t;
  res.locals.tn = (req as any).tn;
  res.locals.lang = lang;

  // EJS templates use `window.__i18n.X` inside <%%= %> tags — but EJS runs
  // server-side where `window` doesn't exist.  Expose a stub so every
  // `<%%= window.__i18n.foo || "fallback" %>` resolves without crashing.
  (res.locals as any).window = { __i18n: req.translations || {} };

  next();
}
