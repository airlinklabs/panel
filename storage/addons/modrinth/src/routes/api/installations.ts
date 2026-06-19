// ── Installations API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { sanitizeServerId } from '../../utils/validation';

export function createInstallationsApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const serverId = sanitizeServerId(req.params.serverId as string);
      if (!serverId) return res.status(400).json({ error: 'Invalid server ID' });

      const installations = await deps.api.prisma.$queryRaw<any[]>`
        SELECT * FROM ModrinthInstallation
        WHERE serverId = ${serverId}
        ORDER BY installedAt DESC
      `;

      res.json(installations);
    } catch (error: any) {
      deps.api.logger.error(`Installations API error: ${error.message}`);
      res.status(500).json({ error: 'Failed to get installations' });
    }
  };
}
