import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../logger';

const translationCache = new Map<string, Record<string, unknown>>();

function loadTranslations(lang: string): Record<string, unknown> {
  if (translationCache.has(lang)) {
    return translationCache.get(lang)!;
  }

  const langPath = path.join(
    __dirname,
    `../../../../storage/lang/${lang}/lang.json`,
  );
  const fallbackPath = path.join(
    __dirname,
    '../../../../storage/lang/en/lang.json',
  );

  try {
    if (fs.existsSync(langPath)) {
      const translations = JSON.parse(fs.readFileSync(langPath, 'utf8'));
      translationCache.set(lang, translations);
      return translations;
    }
    const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    translationCache.set(lang, fallback);
    return fallback;
  } catch (error) {
    logger.error(`Error loading translations for ${lang}:`, error);
    try {
      const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      translationCache.set(lang, fallback);
      return fallback;
    } catch (fallbackError) {
      logger.error(
        'Error loading default English translations:',
        fallbackError,
      );
      return {};
    }
  }
}

export function translationMiddleware(
  req: Request,
  res: Response,
  next: () => void,
) {
  (req as any).lang = req.cookies && req.cookies.lang ? req.cookies.lang : 'en';
  (req as any).translations = loadTranslations((req as any).lang);
  next();
}
