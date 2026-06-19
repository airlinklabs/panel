// ── Search API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { sanitizeSearchQuery, sanitizeOffset, sanitizeLimit, sanitizeSortIndex, isValidProjectType } from '../../utils/validation';

export function createSearchApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const query = sanitizeSearchQuery(req.query.q as string);
      if (!query) {
        return res.status(400).json({ error: 'Invalid or missing search query' });
      }

      const offset = sanitizeOffset(req.query.offset as string);
      const limit = sanitizeLimit(req.query.limit as string);
      const index = sanitizeSortIndex(req.query.index as string);
      const type = isValidProjectType(req.query.type as string) ? (req.query.type as string) : undefined;

      const facets: string[][] = [];
      if (type) facets.push([`project_type:${type}`]);

      const results = await deps.modrinth.search(query, {
        facets: facets.length > 0 ? facets : undefined,
        index,
        offset,
        limit,
      });

      res.json(results);
    } catch (error: any) {
      deps.api.logger.error(`Search API error: ${error.message}`);
      res.status(500).json({ error: 'Search failed' });
    }
  };
}
