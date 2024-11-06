import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';

function loadTranslations(lang: any) {
  const filePath = path.join(
    __dirname,
    `../../../storage/lang/${lang}/lang.json`,
  );
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../../storage/lang/en/lang.json'),
      'utf8',
    ),
  );
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
