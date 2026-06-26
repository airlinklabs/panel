import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticatedForServer } from '../../middleware/serverAuth';
import logger from '../../services/logger';
import { getParamAsString } from '../../utils/typeHelpers';

interface ErrorMessage {
  message?: string;
}

const TASK_TYPES = ['restart', 'backup'] as const;
type TaskType = (typeof TASK_TYPES)[number];

function isValidTaskType(value: string): value is TaskType {
  return TASK_TYPES.includes(value as TaskType);
}

const scheduledTasksModule: Module = {
  info: {
    name: 'Scheduled Tasks Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/tasks',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req }); return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            res.render('user/server/tasks', {
              errorMessage,
              user,
              server: null,
              tasks: [],
              req,
            }); return;
          }

          const tasks = await prisma.scheduledTask.findMany({
            where: { serverId },
            orderBy: { createdAt: 'desc' },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('user/server/tasks', {
            errorMessage,
            user,
            server,
            tasks,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error loading scheduled tasks:', error);
          errorMessage.message = 'Error loading scheduled tasks.';
          res.render('user/server/tasks', {
            errorMessage,
            user: req.session?.user,
            server: null,
            tasks: [],
            req,
          });
        }
      },
    );

    router.post(
      '/server/:id/tasks',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);
        const { type, cronExpr, config } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.status(404).json({ error: 'User not found.' });
          }

          if (!type || !isValidTaskType(type)) {
            return res.status(400).json({ error: 'Invalid task type. Must be restart or backup.' });
          }

          if (!cronExpr || typeof cronExpr !== 'string') {
            return res.status(400).json({ error: 'Cron expression is required.' });
          }

          const cronParts = cronExpr.trim().split(/\s+/);
          if (cronParts.length < 5 || cronParts.length > 6) {
            return res.status(400).json({ error: 'Invalid cron expression format.' });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });

          if (!server) {
            return res.status(404).json({ error: 'Server not found.' });
          }

          let configStr: string | null = null;
          if (config !== undefined && config !== null) {
            configStr = typeof config === 'string' ? config : JSON.stringify(config);
          }

          const task = await prisma.scheduledTask.create({
            data: {
              userId: userId!,
              serverId,
              type,
              cronExpr: cronExpr.trim(),
              enabled: true,
              config: configStr,
            },
          });

          res.status(201).json({ success: true, task });
        } catch (error) {
          logger.error('Error creating scheduled task:', error);
          res.status(500).json({ error: 'Failed to create scheduled task.' });
        }
      },
    );

    router.post(
      '/server/:id/tasks/:taskId/toggle',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const taskId = parseInt(getParamAsString(req.params.taskId), 10);

        try {
          if (isNaN(taskId)) {
            return res.status(400).json({ error: 'Invalid task ID.' });
          }

          const task = await prisma.scheduledTask.findUnique({
            where: { id: taskId },
          });

          if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
          }

          const updated = await prisma.scheduledTask.update({
            where: { id: taskId },
            data: { enabled: !task.enabled },
          });

          res.json({ success: true, task: updated });
        } catch (error) {
          logger.error('Error toggling scheduled task:', error);
          res.status(500).json({ error: 'Failed to toggle task.' });
        }
      },
    );

    router.delete(
      '/server/:id/tasks/:taskId',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const taskId = parseInt(getParamAsString(req.params.taskId), 10);

        try {
          if (isNaN(taskId)) {
            return res.status(400).json({ error: 'Invalid task ID.' });
          }

          const task = await prisma.scheduledTask.findUnique({
            where: { id: taskId },
          });

          if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
          }

          await prisma.scheduledTask.delete({ where: { id: taskId } });
          res.json({ success: true });
        } catch (error) {
          logger.error('Error deleting scheduled task:', error);
          res.status(500).json({ error: 'Failed to delete task.' });
        }
      },
    );

    return router;
  },
};

export default scheduledTasksModule;
