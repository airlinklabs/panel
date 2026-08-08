import type { Request, Response } from 'express';
import { Router } from 'express';
import prisma from '../../db';
import type { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';

const onboardingModule: Module = {
  info: {
    name: 'Onboarding Module',
    description: 'Lets users finish or skip the first-login tutorial.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.post(
      '/onboarding/complete',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          await prisma.users.update({
            where: { id: userId },
            data: { onboardingCompleted: true, onboardingSkipped: false },
          });
          if (req.session.user) req.session.user.onboardingCompleted = true;
          res.json({ success: true });
        } catch {
          res.status(500).json({ error: 'Failed to save onboarding state.' });
        }
      },
    );

    router.post(
      '/onboarding/skip',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          await prisma.users.update({
            where: { id: userId },
            data: { onboardingSkipped: true },
          });
          if (req.session.user) req.session.user.onboardingSkipped = true;
          res.json({ success: true });
        } catch {
          res.status(500).json({ error: 'Failed to save onboarding state.' });
        }
      },
    );

    return router;
  },
};

export default onboardingModule;