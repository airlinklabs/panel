// ── Servers API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser } from '../../utils/auth';

export function createServersApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const servers = await deps.api.prisma.server.findMany({
        where: user.isAdmin ? {} : { ownerId: user.id },
        include: { node: true, owner: true },
      });

      const serverList = servers.map(s => ({
        UUID: s.UUID,
        name: s.name,
        status: s.Installing ? 'installing' : s.Suspended ? 'suspended' : 'running',
        owner: s.owner ? { username: s.owner.username, avatar: s.owner.avatar } : null,
        node: s.node ? { name: s.node.name } : null,
      }));

      res.json({ servers: serverList });
    } catch (error: any) {
      deps.api.logger.error(`Servers API error: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch servers' });
    }
  };
}
