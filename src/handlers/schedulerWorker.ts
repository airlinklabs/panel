import CronParser from 'cron-parser';
import prisma from '../db';
import { daemonRequest } from './utils/core/daemonRequest';
import logger from './logger';

export interface ScheduleWithRelations {
  id: number;
  serverId: string;
  name: string;
  cron: string;
  timeOffset: number;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  server: {
    UUID: string;
    name: string;
    Suspended: boolean;
    node: { address: string; port: number; key: string };
  };
  tasks: { id: number; action: string; payload: string; timeOffset: number }[];
}

export async function runSchedule(schedule: ScheduleWithRelations): Promise<void> {
  for (const task of schedule.tasks) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(task.payload || '{}') as Record<string, unknown>;
    } catch {
      logger.error(`Schedule ${schedule.id} task ${task.id} has invalid payload, skipping`);
      continue;
    }

    if (task.timeOffset > 0) {
      await new Promise((resolve) => setTimeout(resolve, task.timeOffset * 1000));
    }

    try {
      if (schedule.server.Suspended) {
        logger.warn(`Schedule ${schedule.id} skipped: server ${schedule.server.UUID} is suspended`);
        return;
      }

      if (task.action === 'command') {
        await daemonRequest({
          method: 'POST',
          path: '/container/command',
          nodeAddress: schedule.server.node.address,
          nodePort: schedule.server.node.port,
          nodeKey: schedule.server.node.key,
          body: { id: schedule.server.UUID, command: String(payload.command ?? '') },
        });
      } else if (task.action === 'power') {
        const action = String(payload.action ?? '');
        if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
          logger.error(`Schedule ${schedule.id} task ${task.id}: invalid power action "${action}"`);
          continue;
        }
        await daemonRequest({
          method: 'POST',
          path: `/container/${action}`,
          nodeAddress: schedule.server.node.address,
          nodePort: schedule.server.node.port,
          nodeKey: schedule.server.node.key,
          body: { id: schedule.server.UUID },
        });
      } else if (task.action === 'backup') {
        await daemonRequest({
          method: 'POST',
          path: '/container/backup',
          nodeAddress: schedule.server.node.address,
          nodePort: schedule.server.node.port,
          nodeKey: schedule.server.node.key,
          body: {
            id: schedule.server.UUID,
            name: String(payload.name ?? `auto-${Date.now()}`),
          },
        });
      } else {
        logger.error(`Schedule ${schedule.id} task ${task.id}: unknown action "${task.action}"`);
      }
    } catch (err) {
      logger.error(`Schedule ${schedule.id} task ${task.id} failed`, err);
    }
  }
}

export function startScheduler(): void {
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await prisma.schedule.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        include: {
          tasks: { orderBy: { order: 'asc' } },
          server: { include: { node: true } },
        },
      });

      for (const schedule of due) {
        try {
          await runSchedule(schedule);
          const offsetClock = new Date(now.getTime() + (schedule.timeOffset || 0) * 60_000);
          const interval = CronParser.parse(schedule.cron, { currentDate: offsetClock });
          await prisma.schedule.update({
            where: { id: schedule.id },
            data: {
              lastRunAt: now,
              nextRunAt: interval.next().toDate(),
            },
          });
        } catch (err) {
          logger.error(`Schedule ${schedule.id} failed`, err);
        }
      }
    } catch (err) {
      logger.error('Scheduler poll failed', err);
    }
  }, 30_000);
}
