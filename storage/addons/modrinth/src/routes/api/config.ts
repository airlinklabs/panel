// ── Config API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';

export function createConfigApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      if (req.method === 'GET') {
        const settings = await deps.settings.getAll();
        return res.json(settings);
      }

      // POST — update settings
      const { showWarningBanner, warningTitle, warningMessage, disabledProjectTypes, blockedProjects } = req.body;

      await deps.settings.update({
        showWarningBanner: typeof showWarningBanner === 'boolean' ? showWarningBanner : undefined,
        warningTitle: typeof warningTitle === 'string' ? warningTitle : undefined,
        warningMessage: typeof warningMessage === 'string' ? warningMessage : undefined,
        disabledProjectTypes: typeof disabledProjectTypes === 'string' ? disabledProjectTypes : undefined,
        blockedProjects: typeof blockedProjects === 'string' ? blockedProjects : undefined,
      });

      res.json({ success: true, message: 'Settings updated' });
    } catch (error: any) {
      deps.api.logger.error(`Config API error: ${error.message}`);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  };
}
