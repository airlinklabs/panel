/**
 * Client API DTO boundary.
 *
 * The client API is browser-facing JSON: external clients persist and cache
 * these responses, so the shapes below are a stability contract, not an
 * implementation detail. Changes to any exported schema require a bump of
 * `CLIENT_API_VERSION` and a documented compatibility plan (see
 * `docs/client-api.md`).
 *
 * Request bodies are untrusted input and are validated at runtime by the
 * shared validation boundary (`parseBody`); the schemas here reproduce the
 * legacy error strings so existing clients keep working unchanged. Responses
 * come from our own database/daemon and are typed via these schemas rather
 * than re-validated on the hot path.
 */

import { z } from 'zod';

/** Wire version reported by `GET /api/client` and enforced by the version plan. */
export const CLIENT_API_VERSION = 'client-v1';

export const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

export const SCHEDULE_ACTIONS = ['command', 'power', 'backup'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/** POST /api/client/servers/:id/power */
export const powerBodySchema = z
  .object({ action: z.string().optional() })
  .superRefine((data, ctx) => {
    if (!data.action || !POWER_ACTIONS.includes(data.action as PowerAction)) {
      ctx.addIssue({ code: 'custom', message: 'action must be start, stop, restart, or kill' });
    }
  })
  .transform((data) => ({ action: data.action as PowerAction }));
export type PowerBody = z.infer<typeof powerBodySchema>;

/** POST /api/client/servers/:id/files/content */
export const writeFileBodySchema = z
  .object({ file: z.string().optional(), content: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined || data.content === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file and content are required' });
    }
  })
  .transform((data) => ({ file: data.file, content: data.content }));
export type WriteFileBody = z.infer<typeof writeFileBodySchema>;

/** DELETE /api/client/servers/:id/files */
export const deleteFileBodySchema = z
  .object({ file: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file is required' });
    }
  })
  .transform((data) => ({ file: data.file }));
export type DeleteFileBody = z.infer<typeof deleteFileBodySchema>;

/** POST /api/client/servers/:id/files/rename */
export const renameFileBodySchema = z
  .object({ file: z.string().optional(), newname: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined || data.newname === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file and newname are required' });
    }
  })
  .transform((data) => ({ file: data.file, newname: data.newname }));
export type RenameFileBody = z.infer<typeof renameFileBodySchema>;

/** POST /api/client/servers/:id/backups */
export const createBackupBodySchema = z
  .object({ name: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.name === undefined) {
      ctx.addIssue({ code: 'custom', message: 'name is required' });
    }
  })
  .transform((data) => ({ name: data.name }));
export type CreateBackupBody = z.infer<typeof createBackupBodySchema>;

/** POST /api/client/servers/:id/schedules */
export const createScheduleBodySchema = z
  .object({
    name: z.string().optional(),
    cron: z.string().optional(),
    action: z.string().optional(),
    payload: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name === undefined || data.cron === undefined || data.action === undefined) {
      ctx.addIssue({ code: 'custom', message: 'name, cron, and action are required' });
      return;
    }
    if (!SCHEDULE_ACTIONS.includes(data.action as ScheduleAction)) {
      ctx.addIssue({ code: 'custom', message: 'action must be command, power, or backup' });
      return;
    }
    if (data.action === 'power') {
      let parsed: { action?: string };
      try {
        parsed = JSON.parse(typeof data.payload === 'string' ? data.payload : '{}') as { action?: string };
      } catch {
        parsed = {};
      }
      if (!parsed.action || !POWER_ACTIONS.includes(parsed.action as PowerAction)) {
        ctx.addIssue({ code: 'custom', message: 'power payload must include a valid action' });
      }
    }
  })
  .transform((data) => ({
    name: data.name,
    cron: data.cron,
    action: data.action as ScheduleAction,
    payload: typeof data.payload === 'string' ? data.payload : '{}',
  }));
export type CreateScheduleBody = z.infer<typeof createScheduleBodySchema>;

export const clientServerSchema = z.object({
  UUID: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  Installing: z.boolean(),
  Queued: z.boolean(),
  Suspended: z.boolean(),
  nodeId: z.number().nullable(),
  createdAt: z.date(),
});
export type ClientServer = z.infer<typeof clientServerSchema>;

export const clientBackupSchema = z.object({
  UUID: z.string(),
  name: z.string(),
  createdAt: z.date(),
  locked: z.boolean(),
  size: z.string().nullable(),
});
export type ClientBackup = z.infer<typeof clientBackupSchema>;

export const clientScheduleTaskSchema = z.object({
  id: z.number(),
  action: z.string(),
  payload: z.string(),
  order: z.number(),
});
export const clientScheduleSchema = z.object({
  id: z.number(),
  name: z.string(),
  cron: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.date().nullable(),
  lastRunAt: z.date().nullable(),
  createdAt: z.date(),
  tasks: z.array(clientScheduleTaskSchema),
});
export type ClientSchedule = z.infer<typeof clientScheduleSchema>;
