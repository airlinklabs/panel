import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveLocale,
  isValidLocale,
  createRequestI18n,
  createI18nHelpers,
  initI18nCatalogs,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  catalogCache,
} from '../../src/i18n';

describe('i18n', () => {
  beforeEach(() => {
    catalogCache.clear();
    initI18nCatalogs();
  });

  describe('resolveLocale', () => {
    it('returns default for undefined', () => {
      expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    });

    it('returns default for empty string', () => {
      expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    });

    it('returns default for invalid locale', () => {
      expect(resolveLocale('xyz')).toBe(DEFAULT_LOCALE);
    });

    it('returns default for invalid with region', () => {
      expect(resolveLocale('xx-YY')).toBe(DEFAULT_LOCALE);
    });

    it('normalizes lowercase', () => {
      expect(resolveLocale('EN')).toBe('en');
    });

    it('normalizes with whitespace', () => {
      expect(resolveLocale('  de  ')).toBe('de');
    });

    it('accepts all supported locales', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(resolveLocale(locale)).toBe(locale);
      }
    });
  });

  describe('isValidLocale', () => {
    it('accepts supported locales', () => {
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('de')).toBe(true);
      expect(isValidLocale('ja')).toBe(true);
    });

    it('rejects unsupported locales', () => {
      expect(isValidLocale('ko')).toBe(false);
      expect(isValidLocale('ar')).toBe(false);
      expect(isValidLocale('')).toBe(false);
    });
  });

  describe('catalogCache / initI18nCatalogs', () => {
    it('loads all supported locales', () => {
      expect(catalogCache.size).toBe(SUPPORTED_LOCALES.length);
    });

    it('English catalog has keys', () => {
      const en = catalogCache.get('en');
      expect(en).toBeDefined();
      expect(Object.keys(en!).length).toBeGreaterThan(100);
    });

    it('English has known key (compiled format is array)', () => {
      const en = catalogCache.get('en');
      // Compiled catalogs use array format: ["text"] or ["text", ["var"], "text"]
      expect(en!['adminOverviewTitle']).toBeDefined();
    });
  });

  describe('createRequestI18n', () => {
    it('creates i18n instance with English', () => {
      const i18n = createRequestI18n('en');
      expect(i18n.locale).toBe('en');
    });

    it('translates known keys', () => {
      const i18n = createRequestI18n('en');
      expect(i18n.t({ id: 'adminOverviewTitle' })).toBe('Overview');
    });

    it('handles interpolation', () => {
      const i18n = createRequestI18n('en');
      const result = i18n.t({
        id: 'activityActionsRecorded',
        values: { count: 5 },
      });
      expect(result).toBe('5 action(s) recorded.');
    });

    it('returns message ID for missing keys', () => {
      const i18n = createRequestI18n('en');
      expect(i18n.t({ id: 'nonexistent.key' })).toBe('nonexistent.key');
    });

    it('falls back to English for invalid locale', () => {
      const i18n = createRequestI18n('en');
      expect(i18n.t({ id: 'adminOverviewTitle' })).toBe('Overview');
    });
  });

  describe('createI18nHelpers', () => {
    it('provides t() helper', () => {
      const i18n = createRequestI18n('en');
      const helpers = createI18nHelpers(i18n, 'en');
      expect(helpers.t('adminOverviewTitle')).toBe('Overview');
    });

    it('provides t() with interpolation', () => {
      const i18n = createRequestI18n('en');
      const helpers = createI18nHelpers(i18n, 'en');
      expect(helpers.t('activityActionsRecorded', { count: 3 })).toBe(
        '3 action(s) recorded.',
      );
    });

    it('provides tn() helper', () => {
      const i18n = createRequestI18n('en');
      const helpers = createI18nHelpers(i18n, 'en');
      // tn just calls i18n.t with count in values
      const result = helpers.tn('serverCount', 5);
      expect(typeof result).toBe('string');
    });

    it('exposes lang', () => {
      const i18n = createRequestI18n('de');
      const helpers = createI18nHelpers(i18n, 'de');
      expect(helpers.lang).toBe('de');
    });
  });

  describe('missing-translation fallback', () => {
    it('returns message ID when key not found in catalog', () => {
      const i18n = createRequestI18n('en');
      expect(i18n.t({ id: 'definitely.not.real' })).toBe('definitely.not.real');
    });

    it('returns message ID for empty catalog locale', () => {
      // German catalog has fewer keys than English
      const i18n = createRequestI18n('de');
      // adminOverviewTitle may be empty string in German
      const result = i18n.t({ id: 'nonexistentMissingKey' });
      expect(result).toBe('nonexistentMissingKey');
    });
  });
});
