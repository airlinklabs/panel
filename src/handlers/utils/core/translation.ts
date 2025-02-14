import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../logger';

function loadTranslations(lang: string): Record<string, unknown> {
  const langPath = path.join(
    __dirname,
    `../../../../storage/lang/${lang}/lang.json`,
  );
  const fallbackPath = path.join(
    __dirname,
    '../../../../storage/lang/en/lang.json',
  );

  try {
    let translations;
    if (fs.existsSync(langPath)) {
      translations = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    } else {
      translations = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
    logger.info(`Loaded translations for ${lang}`);
    return translations;
  } catch (error) {
    logger.error(`Error loading translations for ${lang}:`, error);
    return {};
  }
}


export function translationMiddleware(
  req: Request,
  res: Response,
  next: () => void,
) {
  const lang = req.cookies && req.cookies.lang ? req.cookies.lang : 'en';
  const translations = loadTranslations(lang);
  
  (req as any).lang = lang;
  (req as any).translations = translations;
  res.locals.translations = translations;
  
  next();
}
