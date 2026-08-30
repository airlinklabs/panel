/**
 * V2 API — Zod DTOs.
 *
 * Request body schemas for every V2 endpoint. Each schema is used with the
 * shared `parseBody` middleware from `src/utils/validation.ts`.
 *
 * Response shapes are documented inline but not runtime-validated (they come
 * from our own database/daemon).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const safePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((v) => !v.includes("\0"), "path contains null byte")
  .refine((v) => !v.includes(".."), "path contains traversal");

const safeFilename = z
  .string()
  .min(1)
  .max(255)
  .refine((v) => !v.includes("\0"), "filename contains null byte")
  .refine((v) => !v.includes(".."), "filename contains traversal")
  .refine(
    (v) => !v.includes("/") && !v.includes("\\"),
    "must be a filename, not a path",
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

export const POWER_ACTIONS = ["start", "stop", "restart", "kill"] as const;
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
  hostId: z.number().int().positive(),
});
export type CreateDatabaseBody = z.infer<typeof createDatabaseBody>;

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export const createBackupBody = z.object({
  name: z.string().min(1).max(100),
});
export type CreateBackupBody = z.infer<typeof createBackupBody>;

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export const SCHEDULE_ACTIONS = ["command", "power", "backup"] as const;

export const createScheduleBody = z.object({
  name: z.string().min(1).max(100),
  cron: z.string().min(1).max(100),
  enabled: z.boolean().optional().default(false),
  action: z.enum(SCHEDULE_ACTIONS),
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
  payload: z.string().max(8192).optional().default("{}"),
  order: z.number().int().min(0).optional().default(0),
  timeOffset: z.number().int().min(0).optional().default(0),
});
export type CreateScheduleTaskBody = z.infer<typeof createScheduleTaskBody>;

// ---------------------------------------------------------------------------
// Sub-users
// ---------------------------------------------------------------------------

export const createSubUserBody = z.object({
  userId: z.number().int().positive(),
  permissions: z.array(z.string()).optional().default([]),
});
export type CreateSubUserBody = z.infer<typeof createSubUserBody>;

export const updateSubUserBody = z.object({
  permissions: z.array(z.string()),
});
export type UpdateSubUserBody = z.infer<typeof updateSubUserBody>;

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export const saveStartupCommandBody = z.object({
  command: z.string().max(2048).nullable(),
});
export type SaveStartupCommandBody = z.infer<typeof saveStartupCommandBody>;

export const saveDockerImageBody = z.object({
  dockerImage: z.string().min(1).max(255),
});
export type SaveDockerImageBody = z.infer<typeof saveDockerImageBody>;

export const saveVariablesBody = z.object({
  variables: z.array(
    z.object({
      key: z.string().min(1).max(255),
      value: z.string().max(8192),
      editable: z.boolean().optional().default(true),
      rules: z.string().optional(),
    }),
  ),
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
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens, underscores"),
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
// Account — check-username, validate-password, images, folders, onboarding
// ---------------------------------------------------------------------------

export const checkUsernameBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens, underscores"),
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
  isAdmin: z.boolean().optional().default(false),
  serverLimit: z.number().int().min(0).optional(),
  maxMemory: z.number().int().min(0).optional(),
  maxCpu: z.number().int().min(0).optional(),
  maxStorage: z.number().int().min(0).optional(),
  maxDatabases: z.number().int().min(0).optional(),
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
  isAdmin: z.boolean().optional(),
  serverLimit: z.number().int().min(0).optional(),
  maxMemory: z.number().int().min(0).optional(),
  maxCpu: z.number().int().min(0).optional(),
  maxStorage: z.number().int().min(0).optional(),
  maxDatabases: z.number().int().min(0).optional(),
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
  onboardingEnabled: z.boolean().optional(),
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
});
export type AdminSettingsSecurityBody = z.infer<
  typeof adminSettingsSecurityBody
>;

export const adminSettingsServerPolicyBody = z.object({
  allowUserCreateServer: z.boolean().optional(),
  allowUserDeleteServer: z.boolean().optional(),
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
});
export type AdminSettingsSmtpBody = z.infer<typeof adminSettingsSmtpBody>;

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
  info: z.string().optional(),
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
  variables: z.string().nullable().optional(),
  startup_done: z.string().nullable().optional(),
  config_files: z.string().nullable().optional(),
  info: z.string().nullable().optional(),
  scripts: z.string().nullable().optional(),
  portRequirements: z.string().nullable().optional(),
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
