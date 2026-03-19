import { Request, Response, NextFunction } from 'express';
import prisma from '../../../db';
import logger from '../../logger';
import crypto from 'crypto';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashingEnabled(): Promise<boolean> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
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
      const lookupKey = useHash ? sha256(rawKey) : rawKey;

      const keyData = await prisma.apiKey.findUnique({ where: { key: lookupKey } });

      if (!keyData) {
        logger.debug(`Invalid API key: ${rawKey.substring(0, 8)}...`);
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
        return;
      }

      if (!keyData.active) {
        logger.debug(`Inactive API key: ${rawKey.substring(0, 8)}...`);
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
            logger.debug(`API key ${rawKey.substring(0, 8)}... lacks permission: ${requiredPermission}`);
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

export default apiValidator;
