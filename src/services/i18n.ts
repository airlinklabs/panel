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

import fs from "fs";
import path from "path";
import logger from "../logger";

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

const LANG_DIR = path.join(__dirname, "../../../storage/lang");

// ─── Loading ──────────────────────────────────────────────────

function loadBundle(lang: string): LangBundle {
  if (bundleCache.has(lang)) {
    return bundleCache.get(lang)!;
  }

  const langPath = path.join(LANG_DIR, lang, "lang.json");
  const fallbackPath = path.join(LANG_DIR, "en", "lang.json");

  const raw = readJson(langPath) ?? readJson(fallbackPath) ?? {};

  const strings: TranslationMap = {};
  const plurals: PluralMap = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // skip commentary keys
    if (
      typeof value === "object" &&
      value !== null &&
      "one" in value &&
      "other" in value
    ) {
      plurals[key] = value as { one: string; other: string };
    } else if (typeof value === "string") {
      strings[key] = value;
    }
  }

  const bundle: LangBundle = { strings, plurals };
  bundleCache.set(lang, bundle);
  return bundle;
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  if (initialized) return;

  try {
    const langs = fs.readdirSync(LANG_DIR).filter((entry) => {
      const stat = fs.statSync(path.join(LANG_DIR, entry));
      return stat.isDirectory();
    });

    for (const lang of langs) {
      loadBundle(lang);
    }

    logger.info(
      `[i18n] Loaded ${bundleCache.size} language(s): ${langs.join(", ")}`,
    );
  } catch (error) {
    logger.error("[i18n] Failed to initialize:", error);
    loadBundle("en"); // ensure at least English works
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
  if (!vars || Object.keys(vars).length === 0) return template;
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
  if (!plural) return key;

  const form = count === 1 ? plural.one : plural.other;
  return interpolate(form, { count, ...vars });
}

/**
 * Get the log language from env (independent of UI language).
 */
export function getLogLang(): string {
  return process.env.LOG_LANG || "en";
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
  req: {
    lang?: string;
    cookies?: Record<string, string>;
    t: Function;
    tn: Function;
  },
  res: { locals: Record<string, unknown> },
  next: () => void,
): void {
  const lang = req.cookies?.lang || "en";
  req.lang = lang;

  // Bind req.t / req.tn with user's language
  req.t = (key: string, vars?: Record<string, string | number>) =>
    t(lang, key, vars);
  req.tn = (
    key: string,
    count: number,
    vars?: Record<string, string | number>,
  ) => tn(lang, key, count, vars);

  // Expose to EJS templates
  res.locals.t = req.t;
  res.locals.tn = req.tn;
  res.locals.lang = lang;

  next();
}
