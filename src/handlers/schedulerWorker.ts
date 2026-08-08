import CronParser from 'cron-parser';
import prisma from '../db';
import { daemonRequest, type HttpResponse } from './utils/core/daemonRequest';
import {
  stopServerContainer,
  type ServerRuntimeConfig,
  type ServerPageServer,
} from '../modules/user/server/shared';
import { persistBackupRecord } from '../modules/user/server/backups';
import { runtimeStartQueue } from './runtimeQueue';
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

export interface ScheduleRunResult {
  ok: boolean;
  errors: string[];
}

function describeDaemonError(resp: Pick<HttpResponse, 'status' | 'data'>): string {
  if (typeof resp.data === 'object' && resp.data !== null) {
    const data = resp.data as { error?: unknown; detail?: unknown };
    const parts = [data.error, data.detail].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (parts.length > 0) {
      return parts.join(' — ');
    }
  }
  return `HTTP ${resp.status}`;
}

function describeThrownError(err: unknown): string {
  if (err instanceof Error) {
    if (err.cause !== undefined) {
      const cause = typeof err.cause === 'string' ? err.cause : err.cause instanceof Error ? err.cause.message : '';
      if (cause) {
        return `${err.message} (${cause})`;
      }
    }
    return err.message;
  }
  return String(err);
}

export async function runSchedule(schedule: ScheduleWithRelations): Promise<ScheduleRunResult> {
  const errors: string[] = [];

  for (const task of schedule.tasks) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(task.payload || '{}') as Record<string, unknown>;
    } catch {
      errors.push(`task ${task.id}: invalid payload`);
      continue;
    }

    if (task.timeOffset > 0) {
      await new Promise((resolve) => setTimeout(resolve, task.timeOffset * 1000));
    }

    if (schedule.server.Suspended) {
      logger.warn(`Schedule ${schedule.id} skipped: server ${schedule.server.UUID} is suspended`);
      return { ok: errors.length === 0, errors };
    }

    try {
      if (task.action === 'command') {
        const resp = await daemonRequest({
          method: 'POST',
          path: '/container/command',
          nodeAddress: schedule.server.node.address,
          nodePort: schedule.server.node.port,
          nodeKey: schedule.server.node.key,
          body: { id: schedule.server.UUID, command: String(payload.command ?? '') },
        });
        if (resp.status >= 400) {
          errors.push(`task ${task.id}: ${describeDaemonError(resp)}`);
        }
      } else if (task.action === 'power') {
        const action = String(payload.action ?? '');
        if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
          errors.push(`task ${task.id}: invalid power action "${action}"`);
          continue;
        }
        if (action === 'start') {
          try {
            // Scheduled starts also pass through the capacity-aware queue; the
            // queue processor grants them when the node has room.
            const ownerRow = await prisma.server.findUnique({
              where: { UUID: schedule.server.UUID },
              select: { ownerId: true },
            });
            await runtimeStartQueue.enqueueStart({
              serverId: schedule.server.UUID,
              userId: ownerRow?.ownerId ?? 0,
              priority: false,
            });
          } catch (err) {
            errors.push(`task ${task.id}: ${describeThrownError(err)}`);
          }
        } else if (action === 'restart') {
          try {
            await stopServerContainer(schedule.server, schedule.server.UUID, 'stop', { releaseResources: false }).catch(() => {});
            const ownerRow = await prisma.server.findUnique({
              where: { UUID: schedule.server.UUID },
              select: { ownerId: true },
            });
            await runtimeStartQueue.enqueueStart({
              serverId: schedule.server.UUID,
              userId: ownerRow?.ownerId ?? 0,
              priority: false,
            });
          } catch (err) {
            errors.push(`task ${task.id}: ${describeThrownError(err)}`);
          }
        } else {
          const method = action === 'kill' ? 'DELETE' : 'POST';
          const path = action === 'kill' ? '/container/kill' : `/container/${action}`;
          const resp = await daemonRequest({
            method,
            path,
            nodeAddress: schedule.server.node.address,
            nodePort: schedule.server.node.port,
            nodeKey: schedule.server.node.key,
            body: { id: schedule.server.UUID },
          });
          if (resp.status >= 400) {
            errors.push(`task ${task.id}: ${describeDaemonError(resp)}`);
          } else if (action === 'stop' || action === 'kill') {
            await prisma.server.update({ where: { UUID: schedule.server.UUID }, data: { Running: false } }).catch(() => {});
            runtimeStartQueue.cleanCapacityFreed().catch(() => undefined);
          }
        }
      } else if (task.action === 'backup') {
        const name = String(payload.name ?? `scheduled-${Date.now()}`);
        const resp = await daemonRequest<{
          success: boolean;
          error?: string;
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
        if (resp.status >= 400) {
          errors.push(`task ${task.id}: ${describeDaemonError(resp)}`);
        } else if (resp.data?.success === false) {
          errors.push(`task ${task.id}: ${typeof resp.data.error === 'string' && resp.data.error.trim() !== '' ? resp.data.error : 'backup failed'}`);
        } else if (resp.data?.success && resp.data.backup?.uuid) {
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
            errors.push(`task ${task.id}: failed to record backup: ${describeThrownError(err)}`);
          }
        }
      } else {
        errors.push(`task ${task.id}: unknown action "${task.action}"`);
      }
    } catch (err) {
      errors.push(`task ${task.id}: ${describeThrownError(err)}`);
    }
  }

  return { ok: errors.length === 0, errors };
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
          const result = await runSchedule(schedule);
          if (!result.ok) {
            logger.warn(`Schedule ${schedule.id} completed with task errors`, { errors: result.errors });
          }
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
