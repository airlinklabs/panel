import CronParser from 'cron-parser';
import prisma from '../db';
import { daemonRequest } from './utils/core/daemonRequest';
import {
  startServerContainer,
  type ServerRuntimeConfig,
  type ServerPageServer,
} from '../modules/user/server/shared';
import { persistBackupRecord } from '../modules/user/server/backups';
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
  server: ServerRuntimeConfig & Pick<ServerPageServer, 'image' | 'UUID'> & { Suspended: boolean };
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
        if (action === 'start') {
          await startServerContainer(schedule.server, schedule.server.UUID);
        } else {
          const method = action === 'kill' ? 'DELETE' : 'POST';
          const path = action === 'kill' ? '/container/kill' : `/container/${action}`;
          await daemonRequest({
            method,
            path,
            nodeAddress: schedule.server.node.address,
            nodePort: schedule.server.node.port,
            nodeKey: schedule.server.node.key,
            body: { id: schedule.server.UUID },
          });
        }
      } else if (task.action === 'backup') {
        const name = String(payload.name ?? `scheduled-${Date.now()}`);
        const resp = await daemonRequest<{
          success: boolean;
          backup?: { uuid: string; name: string; filePath: string; size: number; checksum?: string };
        }>({
          method: 'POST',
          path: '/container/backup',
          nodeAddress: schedule.server.node.address,
          nodePort: schedule.server.node.port,
          nodeKey: schedule.server.node.key,
          body: {
            id: schedule.server.UUID,
            name,
          },
        });
        if (resp.data?.success && resp.data.backup?.uuid) {
          try {
            await persistBackupRecord({
              uuid: resp.data.backup.uuid,
              name,
              serverId: schedule.server.UUID,
              filePath: resp.data.backup.filePath,
              size: BigInt(resp.data.backup.size ?? 0),
              checksum: typeof resp.data.backup.checksum === 'string' ? resp.data.backup.checksum : null,
              airlinkCloudId: null,
            });
          } catch (err) {
            logger.error(`Schedule ${schedule.id} task ${task.id}: failed to record backup`, err);
          }
        }
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
          server: { include: { node: true, image: true } },
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
