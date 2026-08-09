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

// ---------------------------------------------------------------------------
// Request bodies (untrusted input — validated at runtime)
// ---------------------------------------------------------------------------

export const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

export const SCHEDULE_ACTIONS = ['command', 'power', 'backup'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/** POST /api/client/servers/:id/power */
export const powerBodySchema = z
  .object({ action: z.unknown().optional() })
  .superRefine((data, ctx) => {
    if (typeof data.action !== 'string' || !POWER_ACTIONS.includes(data.action as PowerAction)) {
      ctx.addIssue({ code: 'custom', message: 'action must be start, stop, restart, or kill' });
    }
  })
  .transform((data) => ({ action: data.action as PowerAction }));
export type PowerBody = z.infer<typeof powerBodySchema>;

/** POST /api/client/servers/:id/files/content */
export const writeFileBodySchema = z
  .object({ file: z.unknown().optional(), content: z.unknown().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined || data.content === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file and content are required' });
    }
  })
  .transform((data) => ({ file: data.file as string, content: data.content as string }));
export type WriteFileBody = z.infer<typeof writeFileBodySchema>;

/** DELETE /api/client/servers/:id/files */
export const deleteFileBodySchema = z
  .object({ file: z.unknown().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file is required' });
    }
  })
  .transform((data) => ({ file: data.file as string }));
export type DeleteFileBody = z.infer<typeof deleteFileBodySchema>;

/** POST /api/client/servers/:id/files/rename */
export const renameFileBodySchema = z
  .object({ file: z.unknown().optional(), newname: z.unknown().optional() })
  .superRefine((data, ctx) => {
    if (data.file === undefined || data.newname === undefined) {
      ctx.addIssue({ code: 'custom', message: 'file and newname are required' });
    }
  })
  .transform((data) => ({ file: data.file as string, newname: data.newname as string }));
export type RenameFileBody = z.infer<typeof renameFileBodySchema>;

/** POST /api/client/servers/:id/backups */
export const createBackupBodySchema = z
  .object({ name: z.unknown().optional() })
  .superRefine((data, ctx) => {
    if (data.name === undefined) {
      ctx.addIssue({ code: 'custom', message: 'name is required' });
    }
  })
  .transform((data) => ({ name: data.name as string }));
export type CreateBackupBody = z.infer<typeof createBackupBodySchema>;

/** POST /api/client/servers/:id/schedules */
export const createScheduleBodySchema = z
  .object({
    name: z.unknown().optional(),
    cron: z.unknown().optional(),
    action: z.unknown().optional(),
    payload: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name === undefined || data.cron === undefined || data.action === undefined) {
      ctx.addIssue({ code: 'custom', message: 'name, cron, and action are required' });
      return;
    }
    if (typeof data.name !== 'string' || typeof data.cron !== 'string' || typeof data.action !== 'string') {
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
    name: data.name as string,
    cron: data.cron as string,
    action: data.action as ScheduleAction,
    payload: typeof data.payload === 'string' ? data.payload : '{}',
  }));
export type CreateScheduleBody = z.infer<typeof createScheduleBodySchema>;

// ---------------------------------------------------------------------------
// Responses (typed contract for the wire shape)
// ---------------------------------------------------------------------------

/** Item shape shared by GET /api/client/servers and GET /api/client/servers/:id. */
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

/** Item shape from GET /api/client/servers/:id/backups. Size is a string on the wire. */
export const clientBackupSchema = z.object({
  UUID: z.string(),
  name: z.string(),
  createdAt: z.date(),
  locked: z.boolean(),
  size: z.string().nullable(),
});
export type ClientBackup = z.infer<typeof clientBackupSchema>;

/** Item shape from GET /api/client/servers/:id/schedules. */
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
