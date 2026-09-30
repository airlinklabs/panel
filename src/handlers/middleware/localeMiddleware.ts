import type { Request, Response, NextFunction } from 'express';
import {
  resolveLocale,
  createRequestI18n,
  createI18nHelpers,
  type SupportedLocale,
} from '../../i18n';

/**
 * Express middleware that:
 * 1. Detects locale from cookie > Accept-Language > default (en)
 * 2. Validates against allowlist (falls back to English)
 * 3. Creates a per-request Lingui i18n instance
 * 4. Injects t(), tn(), lang into res.locals for EJS templates
 */
export function localeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Locale detection: cookie > Accept-Language > default
  const cookieLang = req.cookies?.lang as string | undefined;
  const acceptLang = req.headers['accept-language'];
  let rawLocale = cookieLang;

  if (!rawLocale && acceptLang) {
    // Parse first language from Accept-Language header: "en-US,en;q=0.9"
    const firstLang = acceptLang.split(',')[0]?.split('-')[0]?.trim();
    rawLocale = firstLang;
  }

  const locale = resolveLocale(rawLocale);

  // Attach to request (type already declared in express.d.ts)
  req.lang = locale as string;

  // Create per-request i18n instance
  const i18n = createRequestI18n(locale);
  const helpers = createI18nHelpers(i18n, locale);

  // Expose to EJS templates via res.locals
  res.locals.t = helpers.t;
  res.locals.tn = helpers.tn;
  res.locals.lang = helpers.lang;

  // Backward compat: req.t() and req.tn() for handlers still migrating
  (req as any).t = helpers.t;
  (req as any).tn = helpers.tn;

  // Window stub for templates using window.__i18n
  (res.locals as any).window = {
    __i18n: new Proxy(
      {},
      {
        get(_target, prop: string) {
          return helpers.t(prop);
        },
      },
    ),
  };

  next();
}
