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
export const CLIENT_API_VERSION = 'client-v2';

// --- Request bodies ---

export const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

export const SCHEDULE_ACTIONS = ['command', 'power', 'backup'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/** POST /api/client/servers/:id/power */
export const powerBodySchema = z.object({ action: z.enum(POWER_ACTIONS) });
export type PowerBody = z.infer<typeof powerBodySchema>;

/** POST /api/client/servers/:id/files/content */
export const writeFileBodySchema = z
  .object({ file: z.string().min(1).max(4096), content: z.string() })
  .superRefine((data, ctx) => {
    if (data.file.includes('\0')) {
      ctx.addIssue({ code: 'custom', message: 'file path contains null byte' });
    }
    if (data.file.includes('..')) {
      ctx.addIssue({ code: 'custom', message: 'file path contains traversal' });
    }
  });
export type WriteFileBody = z.infer<typeof writeFileBodySchema>;

/** DELETE /api/client/servers/:id/files */
export const deleteFileBodySchema = z
  .object({ file: z.string().min(1).max(4096) })
  .superRefine((data, ctx) => {
    if (data.file.includes('\0')) {
      ctx.addIssue({ code: 'custom', message: 'file path contains null byte' });
    }
    if (data.file.includes('..')) {
      ctx.addIssue({ code: 'custom', message: 'file path contains traversal' });
    }
  });
export type DeleteFileBody = z.infer<typeof deleteFileBodySchema>;

/** POST /api/client/servers/:id/files/rename */
export const renameFileBodySchema = z
  .object({
    file: z.string().min(1).max(4096),
    newname: z.string().min(1).max(255),
  })
  .superRefine((data, ctx) => {
    if (data.file.includes('\0') || data.newname.includes('\0')) {
      ctx.addIssue({ code: 'custom', message: 'path contains null byte' });
    }
    if (data.file.includes('..') || data.newname.includes('..')) {
      ctx.addIssue({ code: 'custom', message: 'path contains traversal' });
    }
    if (data.newname.includes('/') || data.newname.includes('\\')) {
      ctx.addIssue({
        code: 'custom',
        message: 'newname must be a filename, not a path',
      });
    }
  });
export type RenameFileBody = z.infer<typeof renameFileBodySchema>;

/** POST /api/client/servers/:id/backups */
export const createBackupBodySchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateBackupBody = z.infer<typeof createBackupBodySchema>;

/** POST /api/client/servers/:id/schedules */
export const createScheduleBodySchema = z
  .object({
    name: z.string().min(1).max(100),
    cron: z.string().min(1).max(100),
    action: z.enum(SCHEDULE_ACTIONS),
    payload: z.string().max(8192).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'power') {
      let parsed: { action?: string };
      try {
        parsed = JSON.parse(data.payload ?? '{}') as { action?: string };
      } catch {
        parsed = {};
      }
      if (
        !parsed.action ||
        !POWER_ACTIONS.includes(parsed.action as PowerAction)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'power payload must include a valid action',
        });
      }
    }
  });
export type CreateScheduleBody = z.infer<typeof createScheduleBodySchema>;

// --- Response types ---

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
