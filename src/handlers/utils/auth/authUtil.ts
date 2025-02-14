import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

/**
 * Middleware to check if the user is authenticated.
 * If `isAdminRequired` is true, it checks if the user has admin privileges.
 * If not authenticated, redirects to the /login page.
 * If authenticated but not an admin (when required), redirects to the / page.
 */
export const isAuthenticated =
  (isAdminRequired = false) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.session.user?.id) {
        return res.redirect('/login');
      }

      if (isAdminRequired && !req.session.user?.isAdmin) {
        return res.redirect('/');
      }

      next();
    };

/**
 * Middleware to check if the request has a valid API key.
 * If no API key is provided or the key is invalid, returns 401.
 * If the key is expired or inactive, returns 403.
 */
export const hasValidApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { user: true }
    });

    if (!key || !key.active) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }

    if (key.expiresAt && new Date() > key.expiresAt) {
      await prisma.apiKey.update({
        where: { id: key.id },
        data: { active: false }
      });
      return res.status(403).json({ error: 'API key has expired' });
    }

    req.user = {
      id: key.user.id,
      email: key.user.email,
      isAdmin: key.user.isAdmin
    };
    req.apiKey = key;
    next();
  } catch (error) {
    console.error('API Key Validation Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
