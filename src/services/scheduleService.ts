import prisma from '../db';

/**
 * List schedules for a server, newest first, with tasks ordered by `order`.
 */
export async function listSchedules(serverId: string) {
  return prisma.schedule.findMany({
    where: { serverId },
    include: { tasks: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single schedule by id, optionally scoped to a server.
 * Returns `null` when not found.
 */
export async function getSchedule(scheduleId: number, serverId?: string) {
  return prisma.schedule.findFirst({
    where: { id: scheduleId, ...(serverId ? { serverId } : {}) },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
}

/**
 * Create a new schedule. Pass `tasks` to create initial tasks in the same
 * write (client API uses this to attach the first task atomically).
 */
export async function createSchedule(
  serverId: string,
  data: {
    name: string;
    cron: string;
    timeOffset?: number;
    enabled?: boolean;
    nextRunAt?: Date | null;
    tasks?: {
      create:
        | {
            order: number;
            action: string;
            payload: string;
            timeOffset?: number;
          }
        | {
            order: number;
            action: string;
            payload: string;
            timeOffset?: number;
          }[];
    };
  },
) {
  return prisma.schedule.create({
    data: {
      serverId,
      name: data.name,
      cron: data.cron,
      enabled: data.enabled ?? true,
      timeOffset: data.timeOffset ?? 0,
      nextRunAt: data.nextRunAt ?? null,
      ...(data.tasks ? { tasks: data.tasks } : {}),
    },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
}

/**
 * Delete a schedule by id, scoped to a server.
 * Returns the deleted schedule or `null` if not found.
 */
export async function deleteSchedule(scheduleId: number, serverId: string) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, serverId },
  });
  if (!schedule) {
    return null;
  }
  await prisma.schedule.delete({ where: { id: schedule.id } });
  return schedule;
}
