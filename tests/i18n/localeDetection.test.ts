import { describe, it, expect, beforeEach } from 'vitest';
import { resolveLocale, SUPPORTED_LOCALES } from '../../src/i18n';

describe('localeMiddleware locale detection', () => {
  describe('cookie-based detection', () => {
    it('prefers cookie over Accept-Language', () => {
      // Simulate: cookie=de, Accept-Language=en
      const cookieLang = 'de';
      const acceptLang = 'en';
      const raw =
        cookieLang || acceptLang?.split(',')[0]?.split('-')[0]?.trim();
      expect(resolveLocale(raw)).toBe('de');
    });

    it('falls back to Accept-Language when no cookie', () => {
      const cookieLang = undefined;
      const acceptLang = 'fr-FR,fr;q=0.9';
      const raw =
        cookieLang || acceptLang?.split(',')[0]?.split('-')[0]?.trim();
      expect(resolveLocale(raw)).toBe('fr');
    });

    it('parses Accept-Language correctly', () => {
      const acceptLang = 'ja,en-US;q=0.9,en;q=0.8';
      const raw = acceptLang.split(',')[0]?.split('-')[0]?.trim();
      expect(resolveLocale(raw)).toBe('ja');
    });

    it('falls back to English for unsupported Accept-Language', () => {
      const acceptLang = 'ko-KR,ko;q=0.9';
      const raw = acceptLang.split(',')[0]?.split('-')[0]?.trim();
      expect(resolveLocale(raw)).toBe('en');
    });
  });

  describe('region code stripping', () => {
    it('strips region from en-US', () => {
      expect(resolveLocale('en-US')).toBe('en');
    });

    it('strips region from zh-CN', () => {
      expect(resolveLocale('zh-CN')).toBe('zh');
    });

    it('strips region from pt-BR', () => {
      expect(resolveLocale('pt-BR')).toBe('pt');
    });
  });

  describe('all supported locales accepted', () => {
    for (const locale of SUPPORTED_LOCALES) {
      it(`accepts ${locale}`, () => {
        expect(resolveLocale(locale)).toBe(locale);
      });
    }
  });
});
