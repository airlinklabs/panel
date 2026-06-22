import { Router, Request, Response } from 'express';
import path from 'path';
import { SettingsStore } from '../../lib/settings-store';

interface AdminDeps {
  settingsStore: SettingsStore;
  prisma: any;
  createAdminMiddleware: () => any;
  getComponents: (viewport?: string) => Record<string, string>;
}

export function createAdminRoutes(deps: AdminDeps): Router {
  const router = Router();
  const { settingsStore, prisma, createAdminMiddleware, getComponents } = deps;

  router.get('/', createAdminMiddleware(), async (req: Request, res: Response) => {
    try {
      const [globalSettings, modrinthSettings] = await Promise.all([
        prisma.settings.findFirst().catch(() => null) || { title: 'Control Panel', logo: '/assets/logo.png', theme: 'dark' },
        settingsStore.get(),
      ]);

      const isMobile = (req as any).cookies?.viewport_mode === 'mobile';
      const viewport = isMobile ? 'mobile' : 'desktop';
      const components = getComponents(viewport);

      res.render(path.join(__dirname, `../../../views/${viewport}/admin.ejs`), {
        title: 'Modrinth Configuration',
        user: req.session?.user,
        req, settings: globalSettings, modrinthSettings,
        components,
      });
    } catch (error) {
      console.error('Error in admin config page:', error);
      res.status(500).json({ error: 'Failed to load admin configuration' });
    }
  });

  router.post('/', createAdminMiddleware(), async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid payload' });
      }

      const { modrinthInstallationWarning, warningTitle, warningMessage, disabledProjectTypes, blockedProjects } = req.body;
      const errors: string[] = [];

      if (typeof modrinthInstallationWarning !== 'boolean') errors.push('modrinthInstallationWarning must be boolean');
      if (typeof warningTitle !== 'string') errors.push('warningTitle must be string');
      else if (warningTitle.length > 200) errors.push('warningTitle too long (max 200)');
      if (typeof warningMessage !== 'string') errors.push('warningMessage must be string');
      else if (warningMessage.length > 500) errors.push('warningMessage too long (max 500)');
      if (!Array.isArray(disabledProjectTypes)) errors.push('disabledProjectTypes must be array');
      else if (disabledProjectTypes.length > 20) errors.push('disabledProjectTypes too large');
      if (!Array.isArray(blockedProjects)) errors.push('blockedProjects must be array');
      else if (blockedProjects.length > 100) errors.push('blockedProjects too large');

      if (errors.length > 0) {
        return res.status(400).json({ success: false, error: errors.join(', ') });
      }

      const cleanTitle = warningTitle?.trim().replace(/[<>"']/g, '').slice(0, 200) || 'Installation Temporarily Disabled';
      const cleanMessage = warningMessage?.trim().replace(/[<>"']/g, '').slice(0, 500) || '';

      await settingsStore.save({
        modrinthInstallationWarning: Boolean(modrinthInstallationWarning),
        warningTitle: cleanTitle,
        warningMessage: cleanMessage,
        disabledProjectTypes: Array.from(new Set(disabledProjectTypes.filter((t: any) => typeof t === 'string' && t.trim()).map((t: any) => String(t).trim()))),
        blockedProjects: Array.from(new Set(blockedProjects.filter((p: any) => typeof p === 'string' && p.trim()).map((p: any) => String(p).trim()))),
      });

      const settings = await settingsStore.get();
      res.json({ success: true, message: 'Configuration saved', settings });
    } catch (error) {
      console.error('Error saving admin config:', error);
      res.status(500).json({ success: false, error: 'Failed to save configuration' });
    }
  });

  return router;
}
