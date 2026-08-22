import { getSettings } from '../../settingsCache';
import { Request, Response, NextFunction } from 'express';
import prisma from '../../../db';
import logger from '../../logger';
import crypto from 'crypto';

// SHA-256 is used for API key hashing (not bcrypt) because:
// 1. API keys are random high-entropy strings, not passwords vulnerable to dictionary attacks
// 2. The lookup is via DB findUnique, not a direct string comparison — no timing leak
// 3. SHA-256 is fast, which is acceptable for high-entropy random keys
// 4. The 200ms delay on invalid keys provides additional timing attack protection
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashingEnabled(): Promise<boolean> {
  try {
    const s = await await getSettings();
    return s?.hashApiKeys === true;
  } catch {
    return false;
  }
}

export const apiValidator = (requiredPermission?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
        return;
      }

      const rawKey = authHeader.split(' ')[1];

      // When key hashing is enabled, look up the SHA-256 hash of the submitted
      // key — the raw value is never stored. Fall back to plaintext if not.
      const useHash = await hashingEnabled();
      const lookupKey = useHash ? sha256(rawKey ?? '') : rawKey ?? '';

      const keyData = await prisma.apiKey.findUnique({ where: { key: lookupKey } });

      if (!keyData) {
        await new Promise(r => setTimeout(r, 200));
        res.status(403).json({ error: 'Invalid API key' });
        return;
      }

      if (!keyData.active) {
        res.status(401).json({ error: 'Unauthorized: API Key is inactive' });
        return;
      }

      if (requiredPermission) {
        try {
          const permissions = JSON.parse(keyData.permissions || '[]');
          const hasPermission = permissions.some((perm: string) => {
            if (perm === requiredPermission) return true;
            if (perm.endsWith('.*')) {
              return requiredPermission.startsWith(perm.slice(0, -2) + '.');
            }
            return false;
          });

          if (!hasPermission) {
            res.status(403).json({ error: 'Forbidden: API Key does not have the required permission', requiredPermission });
            return;
          }
        } catch (error) {
          logger.error('Error parsing API key permissions:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }

      req.apiKey = keyData;
      next();
    } catch (error) {
      logger.error('Error in API validator middleware:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};
