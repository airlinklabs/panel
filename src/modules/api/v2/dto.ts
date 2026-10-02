/**
 * V2 API — Zod DTOs.
 *
 * Request body schemas for every V2 endpoint. Each schema is used with the
 * shared `parseBody` middleware from `src/utils/validation.ts`.
 *
 * Response shapes are documented inline but not runtime-validated (they come
 * from our own database/daemon).
 */

import { z } from 'zod';
import { SUBUSER_PERMISSIONS } from '../../../handlers/utils/auth/serverAuthUtil';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const safePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((v) => !v.includes('\0'), 'path contains null byte')
  .refine((v) => !v.includes('..'), 'path contains traversal');

const safeFilename = z
  .string()
  .min(1)
  .max(255)
  .refine((v) => !v.includes('\0'), 'filename contains null byte')
  .refine((v) => !v.includes('..'), 'filename contains traversal')
  .refine(
    (v) => !v.includes('/') && !v.includes('\\'),
    'must be a filename, not a path',
  );

const VALID_PERMISSIONS = new Set<string>(SUBUSER_PERMISSIONS);

export const permissionSchema = z.array(z.string()).refine(
  (perms) =>
    perms.every((p) => {
      // Exact match
      if (VALID_PERMISSIONS.has(p)) {
        return true;
      }
      // Wildcard: "files.*" → check group exists with read or create
      if (p.endsWith('.*')) {
        const group = p.slice(0, -2);
        return (
          VALID_PERMISSIONS.has(`${group}.read`) ||
          VALID_PERMISSIONS.has(`${group}.create`)
        );
      }
      // Parent: "files" → check any "files.*" exists
      return [...VALID_PERMISSIONS].some((v) => v.startsWith(`${p}.`));
    }),
  { message: 'Invalid permission string' },
);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const updateServerBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  memory: z.number().int().min(0).optional(),
  cpu: z.number().int().min(0).optional(),
  storage: z.number().int().min(0).optional(),
  swap: z.number().int().min(0).optional(),
  backupLimit: z.number().int().min(0).max(50).optional(),
  databaseLimit: z.number().int().min(0).max(50).optional(),
});
export type UpdateServerBody = z.infer<typeof updateServerBody>;

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

export const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
export const powerBody = z.object({ action: z.enum(POWER_ACTIONS) });
export type PowerBody = z.infer<typeof powerBody>;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const writeFileBody = z.object({
  file: safePath,
  content: z.string(),
});
export type WriteFileBody = z.infer<typeof writeFileBody>;

export const deleteFileBody = z.object({ file: safePath });
export type DeleteFileBody = z.infer<typeof deleteFileBody>;

export const renameFileBody = z.object({
  file: safePath,
  newname: safeFilename,
});
export type RenameFileBody = z.infer<typeof renameFileBody>;

export const mkdirBody = z.object({ name: z.string().min(1).max(255) });
export type MkdirBody = z.infer<typeof mkdirBody>;

export const copyFileBody = z.object({
  file: safePath,
  target: safePath,
});
export type CopyFileBody = z.infer<typeof copyFileBody>;

export const zipBody = z.object({
  files: z.array(safePath).min(1).max(100),
  target: safePath,
});
export type ZipBody = z.infer<typeof zipBody>;

export const unzipBody = z.object({
  file: safePath,
  target: safePath.optional(),
});
export type UnzipBody = z.infer<typeof unzipBody>;

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

export const createDatabaseBody = z.object({
  // The host picker submits the <select>'s string value.
  hostId: z.coerce.number().int().positive(),
});
export type CreateDatabaseBody = z.infer<typeof createDatabaseBody>;

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export const createBackupBody = z.object({
  // Optional — the UI's one-click "Create backup" sends no name, so the
  // handler stamps a timestamped default.
  name: z.string().min(1).max(100).optional(),
});
export type CreateBackupBody = z.infer<typeof createBackupBody>;

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export const SCHEDULE_ACTIONS = ['command', 'power', 'backup'] as const;

export const createScheduleBody = z.object({
  name: z.string().min(1).max(100),
  cron: z.string().min(1).max(100),
  enabled: z.boolean().optional().default(false),
  // Optional: the UI creates a bare schedule and attaches tasks afterwards,
  // so the initial task only rides along for direct API clients.
  action: z.enum(SCHEDULE_ACTIONS).optional(),
  payload: z.string().max(8192).optional(),
  timeOffset: z.number().int().min(0).optional().default(0),
});
export type CreateScheduleBody = z.infer<typeof createScheduleBody>;

export const updateScheduleBody = z.object({
  name: z.string().min(1).max(100).optional(),
  cron: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  timeOffset: z.number().int().min(0).optional(),
});
export type UpdateScheduleBody = z.infer<typeof updateScheduleBody>;

export const createScheduleTaskBody = z.object({
  action: z.string().min(1).max(50),
  payload: z.string().max(8192).optional().default('{}'),
  order: z.number().int().min(0).optional().default(0),
  timeOffset: z.number().int().min(0).optional().default(0),
});
export type CreateScheduleTaskBody = z.infer<typeof createScheduleTaskBody>;

// ---------------------------------------------------------------------------
// Sub-users
// ---------------------------------------------------------------------------

/**
 * Create body accepts either identity form:
 *   - `{ email }` — the subusers UI posts the target's email; the handler
 *     resolves it to a user exactly like the legacy route did.
 *   - `{ userId }` — direct API callers target an id.
 * At least one must be present.
 */
export const createSubUserBody = z
  .object({
    email: z.string().trim().min(1).max(255).optional(),
    userId: z.number().int().positive().optional(),
    permissions: permissionSchema.optional().default([]),
  })
  .refine((body) => Boolean(body.email) || body.userId !== undefined, {
    message: 'Either email or userId is required',
    path: ['email'],
  });
export type CreateSubUserBody = z.infer<typeof createSubUserBody>;

export const updateSubUserBody = z.object({
  permissions: permissionSchema,
});
export type UpdateSubUserBody = z.infer<typeof updateSubUserBody>;

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export const saveStartupCommandBody = z.object({
  /** Client-facing field (startup.ejs + save-all both use `startCommand`). */
  startCommand: z.string().max(2048).optional(),
  command: z.string().max(2048).nullable().optional(),
});
export type SaveStartupCommandBody = z.infer<typeof saveStartupCommandBody>;

export const saveDockerImageBody = z.object({
  dockerImage: z.string().min(1).max(255),
});
export type SaveDockerImageBody = z.infer<typeof saveDockerImageBody>;

export const saveVariablesBody = z.object({
  /** Stored verbatim on `server.Variables`; the image defines the shape —
   * same contract as save-all's `variables` field. */
  variables: z.array(z.record(z.string(), z.unknown())),
});
export type SaveVariablesBody = z.infer<typeof saveVariablesBody>;

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const updateUsernameBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, hyphens, underscores'),
});
export type UpdateUsernameBody = z.infer<typeof updateUsernameBody>;

export const updateEmailBody = z.object({
  email: z.string().email(),
});
export type UpdateEmailBody = z.infer<typeof updateEmailBody>;

export const updatePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export type UpdatePasswordBody = z.infer<typeof updatePasswordBody>;

export const updateDescriptionBody = z.object({
  description: z.string().max(500).nullable(),
});
export type UpdateDescriptionBody = z.infer<typeof updateDescriptionBody>;

export const updatePreferredNodeBody = z.object({
  nodeId: z.number().int().positive().nullable(),
});
export type UpdatePreferredNodeBody = z.infer<typeof updatePreferredNodeBody>;

export const updateLanguageBody = z.object({
  language: z.string().min(2).max(5),
});
export type UpdateLanguageBody = z.infer<typeof updateLanguageBody>;

// ---------------------------------------------------------------------------
// Account — check-username, validate-password, images, folders
// ---------------------------------------------------------------------------

export const checkUsernameBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, hyphens, underscores'),
});
export type CheckUsernameBody = z.infer<typeof checkUsernameBody>;

export const validatePasswordBody = z.object({
  password: z.string().min(1),
});
export type ValidatePasswordBody = z.infer<typeof validatePasswordBody>;

export const createImageBody = z.object({
  name: z.string().min(1).max(100),
  dockerImages: z.string().optional(),
  startup: z.string().optional(),
  stop: z.string().optional(),
  variables: z.string().optional(),
  info: z.string().optional(),
  config_files: z.string().optional(),
});
export type CreateImageBody = z.infer<typeof createImageBody>;

export const importImageUrlBody = z.object({
  url: z.string().url(),
});
export type ImportImageUrlBody = z.infer<typeof importImageUrlBody>;

export const createFolderBody = z.object({
  name: z.string().min(1).max(100),
});
export type CreateFolderBody = z.infer<typeof createFolderBody>;

export const addServerToFolderBody = z.object({
  serverUUID: z.string().uuid(),
});
export type AddServerToFolderBody = z.infer<typeof addServerToFolderBody>;

// ---------------------------------------------------------------------------
// Admin — Users
// ---------------------------------------------------------------------------

export const adminCreateUserBody = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  password: z.string().min(8).max(128),
  role: z
    .enum(['owner', 'admin', 'privileged', 'user'])
    .optional()
    .default('user'),
  isAdmin: z.boolean().optional().default(false),
  // The create form sends `null` for untouched limit fields — that means
  // "inherit the global default", which the DB columns (nullable) and the
  // runtime limit checks both treat as unset. `.optional()` alone rejects
  // `null`, so these must be `.nullish()`.
  serverLimit: z.number().int().min(0).nullish(),
  maxMemory: z.number().int().min(0).nullish(),
  maxCpu: z.number().int().min(0).nullish(),
  maxStorage: z.number().int().min(0).nullish(),
  maxDatabases: z.number().int().min(0).nullish(),
});
export type AdminCreateUserBody = z.infer<typeof adminCreateUserBody>;

export const adminUpdateUserBody = z.object({
  email: z.string().email().optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['owner', 'admin', 'privileged', 'user']).optional(),
  isAdmin: z.boolean().optional(),
  // `null` clears the override back to the global default (see create body).
  serverLimit: z.number().int().min(0).nullish(),
  maxMemory: z.number().int().min(0).nullish(),
  maxCpu: z.number().int().min(0).nullish(),
  maxStorage: z.number().int().min(0).nullish(),
  maxDatabases: z.number().int().min(0).nullish(),
});
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserBody>;

// ---------------------------------------------------------------------------
// Admin — Nodes
// ---------------------------------------------------------------------------

export const adminCreateNodeBody = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional().default(3001),
  sftpPort: z.number().int().min(1).max(65535).optional().default(3003),
  key: z.string().min(1).max(255),
  ram: z.number().int().min(0).optional().default(0),
  cpu: z.number().int().min(0).optional().default(0),
  disk: z.number().int().min(0).optional().default(0),
  locationId: z.number().int().positive().nullable().optional(),
  overallocateMemory: z.number().int().min(0).optional().default(0),
  overallocateDisk: z.number().int().min(0).optional().default(0),
  overallocateCpu: z.number().int().min(0).optional().default(0),
});
export type AdminCreateNodeBody = z.infer<typeof adminCreateNodeBody>;

export const adminUpdateNodeBody = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  sftpPort: z.number().int().min(1).max(65535).optional(),
  key: z.string().min(1).max(255).optional(),
  ram: z.number().int().min(0).optional(),
  cpu: z.number().int().min(0).optional(),
  disk: z.number().int().min(0).optional(),
  locationId: z.number().int().positive().nullable().optional(),
  overallocateMemory: z.number().int().min(0).optional(),
  overallocateDisk: z.number().int().min(0).optional(),
  overallocateCpu: z.number().int().min(0).optional(),
  maintenanceMode: z.boolean().optional(),
});
export type AdminUpdateNodeBody = z.infer<typeof adminUpdateNodeBody>;

// ---------------------------------------------------------------------------
// Admin — Servers
// ---------------------------------------------------------------------------

export const adminCreateServerBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ownerId: z.number().int().positive(),
  nodeId: z.number().int().positive(),
  imageId: z.number().int().positive(),
  memory: z.number().int().min(0),
  cpu: z.number().int().min(0),
  storage: z.number().int().min(0),
  swap: z.number().int().min(0).optional().default(0),
  Ports: z.string().optional(),
  StartCommand: z.string().optional(),
  dockerImage: z.string().optional(),
  Variables: z.string().optional(),
  backupLimit: z.number().int().min(0).max(50).optional().default(5),
  databaseLimit: z.number().int().min(0).max(50).optional().default(0),
});
export type AdminCreateServerBody = z.infer<typeof adminCreateServerBody>;

export const adminUpdateServerBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  memory: z.number().int().min(0).optional(),
  cpu: z.number().int().min(0).optional(),
  storage: z.number().int().min(0).optional(),
  swap: z.number().int().min(0).optional(),
  backupLimit: z.number().int().min(0).max(50).optional(),
  databaseLimit: z.number().int().min(0).max(50).optional(),
  nodeId: z.number().int().positive().optional(),
  imageId: z.number().int().positive().optional(),
  StartCommand: z.string().optional(),
  dockerImage: z.string().optional(),
  Variables: z.string().optional(),
});
export type AdminUpdateServerBody = z.infer<typeof adminUpdateServerBody>;

// ---------------------------------------------------------------------------
// Admin — Settings
// ---------------------------------------------------------------------------

export const adminSettingsGeneralBody = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  logo: z.string().optional(),
  favicon: z.string().optional(),
  theme: z.string().optional(),
  lightTheme: z.string().optional(),
  darkTheme: z.string().optional(),
  language: z.string().optional(),
  allowRegistration: z.boolean().optional(),
  uploadLimit: z.number().int().min(1).optional(),
  // Legacy POST /admin/settings/general persisted this key; the settings page
  // fan-out posts it with every save. `''` and whitespace clear the key.
  virusTotalApiKey: z
    .string()
    .max(512)
    .nullable()
    .optional()
    .transform((value) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
});
export type AdminSettingsGeneralBody = z.infer<typeof adminSettingsGeneralBody>;

export const adminSettingsSecurityBody = z.object({
  loginMaxAttempts: z.number().int().min(1).optional(),
  loginLockoutMinutes: z.number().int().min(1).optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitRpm: z.number().int().min(1).optional(),
  enforceDaemonHttps: z.boolean().optional(),
  require2faForAdmins: z.boolean().optional(),
  behindReverseProxy: z.boolean().optional(),
  hashApiKeys: z.boolean().optional(),
  // Legacy POST /admin/settings/security persisted the VT key alongside the
  // other security toggles (the radar tab reads it from settings).
  virusTotalApiKey: z
    .string()
    .max(512)
    .nullable()
    .optional()
    .transform((value) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
});
export type AdminSettingsSecurityBody = z.infer<
  typeof adminSettingsSecurityBody
>;

export const adminSettingsServerPolicyBody = z.object({
  allowUserCreateServer: z.boolean().optional(),
  allowUserDeleteServer: z.boolean().optional(),
  // Legacy POST /admin/settings/server-policy treated this as the image
  // submission toggle (`true`/`'true'`). Read back through getSettings().
  allowUserCreateImages: z
    .preprocess(
      (value) =>
        value === 'true' ? true : value === 'false' ? false : value,
      z.boolean(),
    )
    .optional(),
  defaultServerLimit: z.number().int().min(0).optional(),
  defaultMaxMemory: z.number().int().min(0).optional(),
  defaultMaxCpu: z.number().int().min(0).optional(),
  defaultMaxStorage: z.number().int().min(0).optional(),
  defaultMaxDatabases: z.number().int().min(0).optional(),
  defaultOverallocateMemory: z.number().int().min(0).optional(),
  defaultOverallocateDisk: z.number().int().min(0).optional(),
  defaultOverallocateCpu: z.number().int().min(0).optional(),
  allowPrivilegedServerLimit: z.number().int().min(0).optional(),
  allowPrivilegedMaxMemory: z.number().int().min(0).optional(),
  allowPrivilegedMaxCpu: z.number().int().min(0).optional(),
  allowPrivilegedMaxStorage: z.number().int().min(0).optional(),
  allowPrivilegedMaxDatabases: z.number().int().min(0).optional(),
  defaultMemory: z.number().int().min(0).optional(),
  defaultCpu: z.number().int().min(0).optional(),
  defaultDisk: z.number().int().min(0).optional(),
  maxServersPerUser: z.number().int().min(0).optional(),
});
export type AdminSettingsServerPolicyBody = z.infer<
  typeof adminSettingsServerPolicyBody
>;

export const adminSettingsSmtpBody = z.object({
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPassword: z.string().nullable().optional(),
  smtpFrom: z.string().nullable().optional(),
  smtpSecure: z.boolean().optional(),
  emailCooldown: z.number().int().min(0).optional(),
});
export type AdminSettingsSmtpBody = z.infer<typeof adminSettingsSmtpBody>;

export const adminSettingsFeaturesBody = z.object({
  twoFactorRequired: z.boolean().optional(),
  sftpEnabled: z.boolean().optional(),
  backupsEnabled: z.boolean().optional(),
  schedulesEnabled: z.boolean().optional(),
  databasesEnabled: z.boolean().optional(),
  fileManagerEnabled: z.boolean().optional(),
  consoleEnabled: z.boolean().optional(),
  playerTrackingEnabled: z.boolean().optional(),
  scannerEnabled: z.boolean().optional(),
  airlinkCloudEnabled: z.boolean().optional(),
});
export type AdminSettingsFeaturesBody = z.infer<
  typeof adminSettingsFeaturesBody
>;

export const adminSettingsS3Body = z.object({
  s3Enabled: z.boolean().optional(),
  s3Endpoint: z.string().nullable().optional(),
  s3Region: z.string().nullable().optional(),
  s3Bucket: z.string().nullable().optional(),
  s3AccessKey: z.string().nullable().optional(),
  s3SecretKey: z.string().nullable().optional(),
  s3PathStyle: z.boolean().optional(),
});
export type AdminSettingsS3Body = z.infer<typeof adminSettingsS3Body>;

export const adminBanIpBody = z.object({
  ip: z.string().min(1).max(45), // IPv4 or IPv6
  reason: z.string().max(255).optional(),
});
export type AdminBanIpBody = z.infer<typeof adminBanIpBody>;

// ---------------------------------------------------------------------------
// Admin — Databases
// ---------------------------------------------------------------------------

export const adminCreateDbHostBody = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional().default(3306),
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
  nodeId: z.number().int().positive().nullable().optional(),
});
export type AdminCreateDbHostBody = z.infer<typeof adminCreateDbHostBody>;

// ---------------------------------------------------------------------------
// Admin — Images
// ---------------------------------------------------------------------------

/**
 * `Images.info` is a `@db.Text` JSON blob; the feature allow-list lives at
 * `info.features` (§15.3 F2 — a *missing* `features` key means undeclared and
 * every feature-gated menu item is shown). The image edit form posts the
 * object it round-trips from `state.info`; older/API clients post encoded
 * JSON. Both must land on the column as a string, and an omitted field stays
 * omitted — `info: undefined` is "leave the column alone", not "clear it".
 */
const imageInfoField = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .nullable()
  .optional()
  .transform((value) =>
    typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : value,
  );

/**
 * `variables` / `scripts` / `portRequirements` are `Json` columns and the
 * image edit form posts native JSON — the shape every reader in `src/`
 * expects (`Array.isArray(image.variables)`, `parseImagePortRequirements`,
 * …). Keep accepting the encoded strings the schema historically required;
 * they pass through untouched, so an existing client writes exactly what it
 * wrote before.
 */
const imageJsonListField = z
  .union([z.string(), z.array(z.unknown())])
  .nullable()
  .optional();

const imageJsonObjectField = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .nullable()
  .optional();

export const adminCreateImageBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  author: z.string().max(100).optional(),
  dockerImages: z.string().optional(),
  startup: z.string().optional(),
  stop: z.string().optional(),
  variables: z.string().optional(),
  startup_done: z.string().optional(),
  config_files: z.string().optional(),
  info: imageInfoField,
  scripts: z.string().optional(),
  portRequirements: z.string().optional(),
});
export type AdminCreateImageBody = z.infer<typeof adminCreateImageBody>;

export const adminUpdateImageBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  author: z.string().max(100).nullable().optional(),
  dockerImages: z.string().nullable().optional(),
  startup: z.string().nullable().optional(),
  stop: z.string().nullable().optional(),
  variables: imageJsonListField,
  startup_done: z.string().nullable().optional(),
  config_files: z.string().nullable().optional(),
  info: imageInfoField,
  scripts: imageJsonObjectField,
  portRequirements: imageJsonListField,
});
export type AdminUpdateImageBody = z.infer<typeof adminUpdateImageBody>;

// ---------------------------------------------------------------------------
// Admin — Locations
// ---------------------------------------------------------------------------

export const adminCreateLocationBody = z.object({
  name: z.string().min(1).max(100),
  shortCode: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export type AdminCreateLocationBody = z.infer<typeof adminCreateLocationBody>;

export const adminUpdateLocationBody = z.object({
  name: z.string().min(1).max(100).optional(),
  shortCode: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});
export type AdminUpdateLocationBody = z.infer<typeof adminUpdateLocationBody>;

// ---------------------------------------------------------------------------
// Admin — Mounts
// ---------------------------------------------------------------------------

export const adminCreateMountBody = z.object({
  name: z.string().min(1).max(100),
  source: z.string().min(1).max(500),
  target: z.string().min(1).max(500),
  readOnly: z.boolean().optional().default(false),
});
export type AdminCreateMountBody = z.infer<typeof adminCreateMountBody>;

// ---------------------------------------------------------------------------
// Admin — API Keys
// ---------------------------------------------------------------------------

export const adminCreateApiKeyBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional().default([]),
});
export type AdminCreateApiKeyBody = z.infer<typeof adminCreateApiKeyBody>;

export const adminUpdateApiKeyBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});
export type AdminUpdateApiKeyBody = z.infer<typeof adminUpdateApiKeyBody>;

// ---------------------------------------------------------------------------
// Admin — Roles
// ---------------------------------------------------------------------------

export const adminCreateRoleBody = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  permissions: permissionSchema.optional().default([]),
  isAdmin: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});
export type AdminCreateRoleBody = z.infer<typeof adminCreateRoleBody>;

export const adminUpdateRoleBody = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  permissions: permissionSchema.optional(),
  isAdmin: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type AdminUpdateRoleBody = z.infer<typeof adminUpdateRoleBody>;

// ---------------------------------------------------------------------------
// Admin — Allocations
// ---------------------------------------------------------------------------

export const adminCreateAllocationBody = z.object({
  ip: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
});
export type AdminCreateAllocationBody = z.infer<
  typeof adminCreateAllocationBody
>;

// ---------------------------------------------------------------------------
// Admin — Transfer
// ---------------------------------------------------------------------------

export const adminTransferServerBody = z.object({
  ownerId: z.number().int().positive(),
});
export type AdminTransferServerBody = z.infer<typeof adminTransferServerBody>;

// ---------------------------------------------------------------------------
// Admin — User transfer owner
// ---------------------------------------------------------------------------

export const adminTransferOwnerBody = z.object({
  newOwnerId: z.number().int().positive(),
});
export type AdminTransferOwnerBody = z.infer<typeof adminTransferOwnerBody>;

// ---------------------------------------------------------------------------
// Admin — Radar scripts (net-new: scripts are JSON files in storage/radar)
// ---------------------------------------------------------------------------

/**
 * Script ids are also the on-disk filename (`<id>.json`), so they are pinned
 * to a traversal-safe charset.
 */
export const RADAR_SCRIPT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const radarScriptPatternBody = z.looseObject({
  type: z.string().min(1).max(50),
  pattern: z.string().min(1),
  severity: z.string().max(30).optional(),
  description: z.string().max(500).optional(),
  content: z.string().optional(),
});
export type RadarScriptPatternBody = z.infer<typeof radarScriptPatternBody>;

/**
 * Loose object: scripts may carry extra top-level keys that the scanner
 * understands but this schema does not — they must survive the round trip.
 */
export const adminRadarScriptBody = z.looseObject({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(RADAR_SCRIPT_ID_RE, 'Invalid script ID')
    .optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  version: z.string().min(1).max(32).optional().default('1.0.0'),
  patterns: z.array(radarScriptPatternBody).optional().default([]),
});
export type AdminRadarScriptBody = z.infer<typeof adminRadarScriptBody>;

export const adminRadarScriptUpdateBody = z.looseObject({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(RADAR_SCRIPT_ID_RE, 'Invalid script ID')
    .optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  version: z.string().min(1).max(32).optional(),
  patterns: z.array(radarScriptPatternBody).optional(),
});
export type AdminRadarScriptUpdateBody = z.infer<
  typeof adminRadarScriptUpdateBody
>;

// ---------------------------------------------------------------------------
// Admin — VirusTotal config vs. hash lookup on POST /admin/radar/virustotal
// ---------------------------------------------------------------------------

export const adminRadarVtSettingsBody = z.object({
  enabled: z.boolean(),
  apiKey: z.string().max(512).optional(),
  virusTotalApiKey: z.string().max(512).optional(),
});
export type AdminRadarVtSettingsBody = z.infer<typeof adminRadarVtSettingsBody>;

export const adminRadarVtLookupBody = z.object({
  hash: z
    .string()
    .regex(
      /^[a-fA-F0-9]{32,64}$/,
      'A valid MD5, SHA1, or SHA256 hash is required',
    ),
});
export type AdminRadarVtLookupBody = z.infer<typeof adminRadarVtLookupBody>;

/** Dual-mode body: VT settings save, or a hash lookup (legacy behaviour). */
export const adminRadarVtPostBody = z.union([
  adminRadarVtSettingsBody,
  adminRadarVtLookupBody,
]);
export type AdminRadarVtPostBody = z.infer<typeof adminRadarVtPostBody>;

// ---------------------------------------------------------------------------
// Admin — Addon capabilities / settings / commands
// ---------------------------------------------------------------------------

export const ADDON_CAPABILITIES = [
  'wrapsDashboard',
  'wrapsAdminLayout',
  'runsRawSql',
  'registersSchedules',
] as const;

export const adminAddonCapabilityBody = z.object({
  capability: z.enum(ADDON_CAPABILITIES),
  enabled: z.boolean().default(true),
});
export type AdminAddonCapabilityBody = z.infer<typeof adminAddonCapabilityBody>;

/**
 * Addon settings are a free-form key/value bag defined per-addon by its
 * manifest `settingsSchema`; only the "is it an object?" edge is validated
 * here, the manifest schema is applied in the handler.
 */
export const adminAddonSettingsBody = z.preprocess(
  (value) => (value !== null && typeof value === 'object' ? value : {}),
  z.looseObject({}),
);

/** Commands are posted with no body at all — args are optional. */
export const adminAddonCommandBody = z.preprocess(
  (value) => (value !== null && typeof value === 'object' ? value : {}),
  z.looseObject({ args: z.unknown().optional() }),
);
export interface AdminAddonCommandBody {
  args?: unknown;
}

// ---------------------------------------------------------------------------
// Server creation (user flow)
// ---------------------------------------------------------------------------

/** The create-server form posts every field as a string; resource columns are
 * capitalized to match the form input `name`s (`Memory`, `Cpu`, `Storage`,
 * `Swap`). Accept both string and number so JSON callers work too. */
const numericish = z.union([z.string(), z.number()]);

export const createServerBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  nodeId: numericish,
  imageId: numericish,
  dockerImage: z.string().min(1).max(255),
  Memory: numericish,
  Cpu: numericish,
  Storage: numericish,
  Swap: numericish.optional(),
  /** Multi-port flow: users pick internal ports, external ports are assigned
   * from the node pool. Falls back to the image's port requirements. */
  ports: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        internalPort: z.number().int().optional(),
        port: z.number().int().optional(),
      }),
    )
    .max(20)
    .optional(),
  /** Rendered by `partials/csrf` in the form; harmless here. */
  _csrf: z.string().optional(),
});
export type CreateServerBody = z.infer<typeof createServerBody>;

// ---------------------------------------------------------------------------
// Server settings
// ---------------------------------------------------------------------------

export const updateServerSettingsBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});
export type UpdateServerSettingsBody = z.infer<
  typeof updateServerSettingsBody
>;

// ---------------------------------------------------------------------------
// Startup — save-all
// ---------------------------------------------------------------------------

export const saveStartupBody = z.object({
  startCommand: z.string().max(2048).optional(),
  command: z.string().max(2048).optional().nullable(),
  dockerImage: z.string().min(1).max(255).optional(),
  /** Stored verbatim on `server.Variables`; the image defines the shape. */
  variables: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type SaveStartupBody = z.infer<typeof saveStartupBody>;

// ---------------------------------------------------------------------------
// Files — detail / generic action / upload
// ---------------------------------------------------------------------------

export const pullFileBody = z.object({
  url: z.string().min(1).max(2048),
  path: z.string().max(4096).optional(),
});
export type PullFileBody = z.infer<typeof pullFileBody>;

/**
 * Generic file dispatcher. `POST /files/action` receives
 * `{ action: 'delete', ...body }` from the page controller; the action list
 * mirrors the operations the file manager exposes.
 */
export const fileActionBody = z.object({
  action: z.string().min(1).max(32),
  file: safePath.optional(),
  path: z.string().max(4096).optional(),
  target: z.string().max(4096).optional(),
  name: z.string().min(1).max(255).optional(),
  newname: z.string().min(1).max(255).optional(),
  newName: z.string().min(1).max(255).optional(),
  files: z.array(safePath).max(100).optional(),
  content: z.string().optional(),
  zipname: z.string().min(1).max(255).optional(),
  relativePath: z.string().max(4096).optional(),
  url: z.string().max(2048).optional(),
});
export type FileActionBody = z.infer<typeof fileActionBody>;

/** JSON upload body (the page route has no multer). */
export const uploadFileBody = z
  .object({
    path: z.string().max(4096).optional(),
    fileName: z.string().min(1).max(255).optional(),
    fileContent: z.string().optional(),
    file: z.string().min(1).max(255).optional(),
    content: z.string().optional(),
  })
  .refine(
    (d) =>
      (d.fileName !== undefined && d.fileContent !== undefined) ||
      (d.file !== undefined && d.content !== undefined),
    { message: 'fileName and fileContent are required' },
  );
export type UploadFileBody = z.infer<typeof uploadFileBody>;
