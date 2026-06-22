import { Router, Request, Response } from 'express';
import { validateServerId, validateProjectId, validateVersionId } from '../../utils/validation';

interface InstallDeps {
  installer: any;
  modrinthClient: any;
  settingsStore: any;
  progressTracker: any;
  createAuthMiddleware: () => any;
  prisma: any;
}

export function createInstallRoutes(deps: InstallDeps): Router {
  const router = Router();
  const { installer, modrinthClient, settingsStore, progressTracker, createAuthMiddleware, prisma } = deps;
  const isAuthenticated = createAuthMiddleware();

  const activeInstallations = new Map<string, boolean>();
  const installRateLimit = new Map<string, number[]>();
  const RATE_LIMIT_WINDOW = 60 * 1000;
  const RATE_LIMIT_MAX = 5;

  function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = installRateLimit.get(userId) || [];
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length >= RATE_LIMIT_MAX) return false;
    recent.push(now);
    installRateLimit.set(userId, recent);
    return true;
  }

  router.post('/', isAuthenticated('serverId'), async (req: Request, res: Response) => {
    try {
      const { serverId, projectId, versionId } = req.body;

      const serverValidation = validateServerId(serverId);
      if (!serverValidation.valid) return res.status(400).json({ success: false, error: serverValidation.error });

      const projectValidation = validateProjectId(projectId);
      if (!projectValidation.valid) return res.status(400).json({ success: false, error: projectValidation.error });

      const versionValidation = validateVersionId(versionId);
      if (!versionValidation.valid) return res.status(400).json({ success: false, error: versionValidation.error });

      const installKey = `${serverId}:${versionId}`;
      if (activeInstallations.has(installKey)) {
        return res.status(409).json({ success: false, error: 'Installation already in progress' });
      }

      const userId = String(req.session?.user?.id || '');
      if (!checkRateLimit(userId)) {
        return res.status(429).json({ success: false, error: 'Too many installations. Try again later.' });
      }

      const blockStatus = await settingsStore.isProjectBlocked(projectId, 'unknown');
      if (blockStatus.blocked) {
        return res.status(403).json({
          success: false,
          error: 'Project installation is blocked by administrator',
          reason: blockStatus.reason,
        });
      }

      activeInstallations.set(installKey, true);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const sendEvent = (data: Record<string, any>) => {
        try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
      };

      sendEvent({ type: 'progress', stage: 'initializing', message: 'Starting installation...', progress: 0 });

      let completed = false;
      let lastStage = '';
      let lastMessage = '';

      const pollInterval = setInterval(() => {
        const progress = progressTracker.getProgress(serverId, projectId);
        if (!progress) return;

        if (progress.stage !== lastStage || progress.stageMessage !== lastMessage) {
          lastStage = progress.stage;
          lastMessage = progress.stageMessage;
          sendEvent({
            type: 'progress',
            stage: progress.stage,
            message: progress.stageMessage,
            progress: Math.round(progress.overallProgress),
          });
        }

        if (progress.currentMod) {
          sendEvent({
            type: 'log',
            level: 'info',
            message: `[mod] ${progress.currentMod} — ${progress.completedMods}/${progress.totalMods}`,
          });
        }

        for (const warning of progress.warnings) {
          sendEvent({ type: 'log', level: 'warning', message: `[warn] ${warning}` });
        }
        progress.warnings.length = 0;

        for (const err of progress.criticalErrors) {
          sendEvent({ type: 'log', level: 'error', message: `[error] ${err}` });
        }
        progress.criticalErrors.length = 0;

        if (progress.stage === 'completed' && !completed) {
          completed = true;
          sendEvent({ type: 'complete', message: 'Installation completed successfully' });
          cleanup();
        } else if (progress.stage === 'failed' && !completed) {
          completed = true;
          sendEvent({ type: 'error', message: progress.error || 'Installation failed' });
          cleanup();
        }
      }, 500);

      const cleanup = () => {
        clearInterval(pollInterval);
        activeInstallations.delete(installKey);
        try { res.end(); } catch {}
      };

      req.on('close', () => {
        if (!completed) {
          clearInterval(pollInterval);
          activeInstallations.delete(installKey);
        }
      });

      installer.installModpack(serverId, projectId, versionId, modrinthClient)
        .catch((err: any) => {
          if (!completed) {
            completed = true;
            sendEvent({ type: 'error', message: 'Installation failed. Check server logs for details.' });
            cleanup();
          }
        });
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to start installation' });
      } else {
        try { res.end(); } catch {}
      }
    }
  });

  return router;
}
