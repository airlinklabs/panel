import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from '../../logger';

const prisma = new PrismaClient();

/**
 * Middleware to validate API keys and check permissions
 * @param requiredPermission - The permission required to access the endpoint
 * @returns Express middleware function
 */
export const apiValidator = (requiredPermission?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {

      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized: Missing or malformed Authorization header',
        });
        return;
      }

      const apiKey = authHeader.split(' ')[1];


      const keyData = await prisma.apiKey.findUnique({
        where: { key: apiKey },
      });

      if (!keyData) {
        logger.debug(`Invalid API key used: ${apiKey.substring(0, 8)}...`);
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
        return;
      }

      if (!keyData.active) {
        logger.debug(`Inactive API key used: ${apiKey.substring(0, 8)}...`);
        res.status(401).json({ error: 'Unauthorized: API Key is inactive' });
        return;
      }


      if (requiredPermission) {
        try {
          const permissions = JSON.parse(keyData.permissions || '[]');

          const hasPermission = permissions.some((perm: string) => {

            if (perm === requiredPermission) return true;


            if (perm.endsWith('.*')) {
              const base = perm.slice(0, -2);
              return requiredPermission.startsWith(`${base}.`);
            }

            return false;
          });

          if (!hasPermission) {
            logger.debug(`API key ${apiKey.substring(0, 8)}... lacks permission: ${requiredPermission}`);
            res.status(403).json({
              error: 'Forbidden: API Key does not have the required permission',
              requiredPermission
            });
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
