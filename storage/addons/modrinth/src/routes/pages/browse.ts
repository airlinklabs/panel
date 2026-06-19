// ── Browse Page Route ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser } from '../../utils/auth';
import { sanitizeSearchQuery, sanitizeOffset, sanitizeSortIndex, sanitizePage } from '../../utils/validation';
import { isValidProjectType } from '../../utils/validation';

export function createBrowsePage(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.redirect('/auth/login');

      const settings = await deps.settings.getAll();
      const isMobile = (req.session as any)?.device === 'mobile';

      const query = sanitizeSearchQuery(req.query.q as string);
      const offset = sanitizeOffset(req.query.offset as string);
      const type = isValidProjectType(req.query.type as string) ? (req.query.type as string) : undefined;
      const index = sanitizeSortIndex(req.query.index as string);
      const page = sanitizePage(req.query.page as string);

      let results = null;
      if (query) {
        const facets: string[][] = [];
        if (type) facets.push([`project_type:${type}`]);

        results = await deps.modrinth.search(query, {
          facets: facets.length > 0 ? facets : undefined,
          index,
          offset,
          limit: 20,
        });
      }

      const data = {
        title: 'Modrinth Store',
        user,
        query: query ?? '',
        type: type ?? '',
        index,
        page,
        results,
        settings,
      };

      const html = await deps.api.renderView('browse.ejs', data, isMobile);
      res.send(html);
    } catch (error: any) {
      deps.api.logger.error(`Browse page error: ${error.message}`);
      res.status(500).send('Internal server error');
    }
  };
}
