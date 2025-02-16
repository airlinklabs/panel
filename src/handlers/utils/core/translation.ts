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

  const defaultTranslations = {
    adminCreateNodeTitle: 'Create Node',
    adminCreateNodeText: 'Create a new node on Airlink',
    location: 'Location',
    create: 'Create',
    addressIP: 'IP Address', 
    daemonPort: 'Daemon Port',
    name: 'Name',
    ram: 'RAM',
    cpu: 'CPU',
    disk: 'Disk'
  };

  try {
    if (fs.existsSync(langPath)) {
      return { ...defaultTranslations, ...JSON.parse(fs.readFileSync(langPath, 'utf8')) };
    }
    return { ...defaultTranslations, ...JSON.parse(fs.readFileSync(fallbackPath, 'utf8')) };
  } catch (error) {
    logger.error(`Error loading translations for ${lang}:`, error);
    return defaultTranslations;
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
