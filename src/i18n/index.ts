import { setupI18n, type I18n } from '@lingui/core';

// ─── Supported locales ─────────────────────────────────────────
export const SUPPORTED_LOCALES = [
  'en',
  'de',
  'es',
  'fr',
  'it',
  'ja',
  'pt',
  'ru',
  'ta',
  'zh',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

// ─── Catalog cache ─────────────────────────────────────────────
// Compiled catalogs keyed by locale. Loaded once, reused across requests.
const catalogCache = new Map<string, Record<string, string>>();

// ─── Locale validation ─────────────────────────────────────────

export function isValidLocale(locale: string): locale is SupportedLocale {
  return LOCALE_SET.has(locale);
}

/**
 * Resolve locale from raw input. Validates against allowlist,
 * falls back to English for invalid values.
 * Strips region codes (e.g. "en-US" -> "en").
 */
export function resolveLocale(raw: string | undefined): SupportedLocale {
  if (!raw) {return DEFAULT_LOCALE;}
  const normalized = raw.trim().toLowerCase();
  // Strip region: "en-US" -> "en", "zh-CN" -> "zh"
  const base = normalized.split('-')[0];
  if (base && isValidLocale(base)) {return base;}
  if (isValidLocale(normalized)) {return normalized;}
  return DEFAULT_LOCALE;
}

// ─── Catalog loading ───────────────────────────────────────────

/**
 * Load a compiled Lingui catalog for a locale.
 * Uses require() for synchronous loading in Node.js.
 * Catalogs live at locales/<lang>/messages.js (compiled by lingui compile).
 */
function loadCatalog(locale: string): Record<string, string> {
  if (catalogCache.has(locale)) {
    return catalogCache.get(locale)!;
  }

  try {
    // Compiled catalogs are plain JS: module.exports = { messages: {...} }
    // But lingui compile --format minimal outputs: { "key": "value" }
    const catalogPath = `../../locales/${locale}/messages`;
     
    const mod = require(catalogPath);
    const messages = mod.messages ?? mod.default ?? mod;
    catalogCache.set(locale, messages);
    return messages;
  } catch {
    // If locale catalog not found, fall back to English
    if (locale !== DEFAULT_LOCALE) {
      return loadCatalog(DEFAULT_LOCALE);
    }
    // English not found either — return empty
    return {};
  }
}

/**
 * Pre-load all catalogs at startup. Called once from app.ts.
 */
export function initI18nCatalogs(): void {
  for (const locale of SUPPORTED_LOCALES) {
    loadCatalog(locale);
  }
}

// ─── Per-request i18n instance ─────────────────────────────────

/**
 * Create a request-scoped Lingui i18n instance with the given locale activated.
 * Each request gets its own instance to avoid shared state.
 */
export function createRequestI18n(locale: SupportedLocale): I18n {
  const i18n = setupI18n();
  const messages = loadCatalog(locale);
  i18n.load(locale, messages);
  i18n.activate(locale);
  return i18n;
}

// ─── EJS helper type ───────────────────────────────────────────

export interface I18nHelpers {
  /** Translate a message by ID: t('key') or t('key', { name: 'value' }) */
  t: (id: string, vars?: Record<string, string | number>) => string;
  /** Translate with plural support: tn('key', count) */
  tn: (
    id: string,
    count: number,
    vars?: Record<string, string | number>,
  ) => string;
  /** Current locale code */
  lang: SupportedLocale;
}

/**
 * Create EJS helpers bound to a specific i18n instance.
 * Inject into res.locals for template access.
 */
export function createI18nHelpers(
  i18n: I18n,
  locale: SupportedLocale,
): I18nHelpers {
  return {
    t(id: string, vars?: Record<string, string | number>): string {
      if (vars && Object.keys(vars).length > 0) {
        return i18n.t({ id, values: vars });
      }
      return i18n.t({ id });
    },
    tn(
      id: string,
      count: number,
      vars?: Record<string, string | number>,
    ): string {
      return i18n.t({
        id,
        values: { count, ...vars },
      });
    },
    lang: locale,
  };
}

// ─── Export for direct access ──────────────────────────────────

export { catalogCache };
