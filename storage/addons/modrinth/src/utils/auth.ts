import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(prisma: any) {
  return function isAuthenticated(
    serverIdParam: string = 'id',
  ) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const userId = req.session?.user?.id;
      if (!userId) {
        req.path.startsWith('/api/')
          ? res.status(401).json({ success: false, error: 'Authentication required' })
          : res.redirect('/login');
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          req.path.startsWith('/api/')
            ? res.status(401).json({ success: false, error: 'User not found' })
            : res.redirect('/login');
          return;
        }

        if (user.isAdmin) { next(); return; }

        const serverId = req.params[serverIdParam];
        if (!serverId) {
          res.status(400).json({ success: false, error: 'Server ID required' });
          return;
        }

        const server = await prisma.server.findUnique({ where: { UUID: serverId } });
        if (!server) {
          res.status(404).json({ success: false, error: 'Server not found' });
          return;
        }

        if (server.ownerId === userId) { next(); return; }

        req.path.startsWith('/api/')
          ? res.status(403).json({ success: false, error: 'Access denied' })
          : res.redirect('/');
      } catch {
        req.path.startsWith('/api/')
          ? res.status(500).json({ success: false, error: 'Authentication error' })
          : res.redirect('/');
      }
    };
  };
}

export function createAdminMiddleware(prisma: any) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session?.user?.id;
    if (!userId) {
      req.path.startsWith('/api/')
        ? res.status(401).json({ success: false, error: 'Not authenticated' })
        : res.redirect('/login');
      return;
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user?.isAdmin) {
        res.status(403).json({ success: false, error: 'Admin required' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Auth check failed' });
    }
  };
}
