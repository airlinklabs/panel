/**
 * Daemon boundary DTOs.
 *
 * Every panel→daemon HTTP response crosses this boundary as untrusted input.
 * Callers must validate the parsed payload with these schemas before trusting
 * field values — types alone never validate network responses. The schemas
 * mirror the daemon's documented JSON shapes (see daemon/src/routes/*).
 *
 * Each schema is deliberately tolerant where the daemon can legally omit
 * fields, and strict where a wrong type would corrupt panel state.
 */

import { z } from 'zod';

// ── GET /container/status ──────────────────────────────────────────────────
// { running, exists, source, status?, exitCode?, startedAt?, finishedAt? }
export const containerStatusSchema = z.object({
  running: z.boolean().optional(),
  exists: z.boolean().optional(),
  source: z.enum(['cache', 'inspect']).optional(),
  status: z.string().optional(),
  exitCode: z.number().nullable().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export type ContainerStatus = z.infer<typeof containerStatusSchema>;

// ── GET / (node root) ──────────────────────────────────────────────────────
// { versionFamily?, versionRelease?, status?, remote? }
// NOTE: daemon sends versionFamily as a number and remote as a string hostname.
// The schema must accept both to avoid parse failures.
export const daemonInfoSchema = z.object({
  versionFamily: z.union([z.string(), z.number()]).optional(),
  versionRelease: z.string().optional(),
  status: z.string().optional(),
  remote: z.union([z.boolean(), z.string()]).optional(),
});

export type DaemonInfo = z.infer<typeof daemonInfoSchema>;

// ── GET /fs/list ───────────────────────────────────────────────────────────
// One directory entry. The daemon always returns name/type/size; extension and
// category are null for directories.
export const fsFileEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  extension: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  size: z.number().optional(),
});

export type FsFileEntry = z.infer<typeof fsFileEntrySchema>;

export const fsListSchema = z.array(fsFileEntrySchema);

// ── Install / power state payloads ─────────────────────────────────────────
export const daemonStateSchema = z.object({
  state: z.string().optional(),
  error: z.string().optional(),
});

export type DaemonState = z.infer<typeof daemonStateSchema>;

// ── Minecraft players (GET /minecraft/players) ─────────────────────────────
// Daemon returns { players, maxPlayers, onlinePlayers, description, version,
// online }. Transient ping failures still return this shape with online:false.
export const daemonPlayerSchema = z.object({
  name: z.string(),
  uuid: z.string(),
});

export type DaemonPlayer = z.infer<typeof daemonPlayerSchema>;

export const daemonPlayerListSchema = z.object({
  players: z.array(daemonPlayerSchema).optional(),
  online: z.boolean().optional(),
  maxPlayers: z.number().optional(),
  onlinePlayers: z.number().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
});

export type DaemonPlayerList = z.infer<typeof daemonPlayerListSchema>;

// ── Power/action result (POST /container/start|stop|restart) ──────────────
export const daemonActionResultSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export type DaemonActionResult = z.infer<typeof daemonActionResultSchema>;

/**
 * Parses an arbitrary daemon response payload against a schema.
 * The daemon may return a JSON string (some legacy endpoints) or an object;
 * both are accepted. On failure the raw value is returned so callers keep
 * their existing defensive handling (e.g. `files = files.filter(...)`).
 */
export function parseDaemonResponse<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): T | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}
