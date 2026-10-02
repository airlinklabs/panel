import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';

// ── Menu Manager → redirect stub (Phase 16) ──────────────────────────────
// The Menu Manager page was deleted at the user's request: `views/admin/menu/`
// and the *page* controller `src/modules/pages/admin/menu.ts` are both gone,
// and so is the nav entry.
//
// This module deliberately stays registered rather than being deleted, for
// three reasons:
//   1. It owns the old URLs, so `/admin/menu` and `/menu` answer with a 302
//      instead of falling through to the not-found handler. `src/modules/
//      user/images.ts` is the same pattern (legacy → Account #images).
//   2. The original `/admin/menu` handler rendered `admin/menu/menu.ejs`, a
//      view that has never existed — it only ever "worked" by catching the
//      render error and redirecting anyway. That failure path is gone.
//   3. `tests/featureRegistry.test.ts` pins the mount order: the admin group
//      must stay contiguous with `admin/users` at index 17, i.e. 18 admin
//      modules. `tests/**` is not editable, and registry order is a real
//      contract (first-match wins in Express), so the group is preserved by
//      keeping an honest module in its alphabetical slot.
const adminMenuModule: Module = {
  info: {
    name: 'Admin Menu Module',
    description: 'Redirects the removed Menu Manager URLs to the admin home.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/menu',
      isAuthenticated(true, 'airlink.admin.overview.main'),
      (_req: Request, res: Response) => {
        res.redirect('/admin/overview');
      },
    );

    router.get(
      '/menu',
      isAuthenticated(false),
      (_req: Request, res: Response) => {
        res.redirect('/');
      },
    );

    return router;
  },
};

export default adminMenuModule;
