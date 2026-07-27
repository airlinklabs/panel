import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import {
  type ErrorMessage,
  getImageFeatures,
} from './shared';

export function registerSettingsRoutes(router: Router): void {
  router.get(
    '/server/:id/settings',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          return res.render('user/account', { errorMessage, user, req });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = 'Server not found.';
          return res.render('user/server/settings', {
            errorMessage,
            user,
            req,
            settings,
          });
        }

        const features = getImageFeatures(server.image);

        return res.render('user/server/settings', {
          errorMessage,
          features,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
          user,
          req,
          server,
          settings,
        });
      } catch (error) {
        logger.error('Error fetching server settings data:', error);
        errorMessage.message = 'Error fetching server data.';
        return res.render('user/server/settings', {
          errorMessage,
          user: req.session?.user,
          req,
          settings,
        });
      }
    },
  );

  router.post(
    '/server/:id/settings',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { name, description } = req.body;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: {
            name: name,
            description: description,
          },
        });

        res.status(200).json({ success: true });
      } catch (error) {
        logger.error('Error updating server settings:', error);
        res.status(500).json({ error: 'Failed to update server settings' });
      }
    },
  );
}
