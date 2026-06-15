// ── Admin Route Input Validation Schemas ─────────────────────────────────────
// Zod schemas for admin mutation routes. Apply at route boundaries before
// any DB call. Import and use with `schema.parse(req.body)` or the
// `validateBody` middleware.

import { z } from 'zod';

// ── User Management ─────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(32).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isAdmin: z.boolean().optional().default(false),
  description: z.string().max(500).optional(),
  serverLimit: z.number().int().min(0).optional().default(0),
  maxMemory: z.number().int().min(0).optional().default(0),
  maxCpu: z.number().int().min(0).optional().default(0),
  maxStorage: z.number().int().min(0).optional().default(0),
});

export const updateUserSchema = createUserSchema.partial().extend({
  permissions: z.array(z.string()).optional(),
});

// ── Node Management ─────────────────────────────────────────────────────────

export const createNodeSchema = z.object({
  name: z.string().min(1, 'Node name is required').max(64),
  address: z.string().min(1, 'Address is required'),
  port: z.number().int().min(1).max(65535),
  memory: z.number().int().min(0),
  disk: z.number().int().min(0),
  cpu: z.number().int().min(0),
  isPublic: z.boolean().optional().default(true),
});

export const updateNodeSchema = createNodeSchema.partial();

// ── Server Management ───────────────────────────────────────────────────────

export const createServerSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(128),
  description: z.string().max(500).optional(),
  nodeId: z.number().int().positive('Node ID is required'),
  imageId: z.number().int().positive('Image ID is required'),
  ownerId: z.number().int().positive('Owner ID is required'),
  memory: z.number().int().min(64, 'Minimum memory is 64 MB'),
  cpu: z.number().int().min(1, 'Minimum CPU is 1%'),
  storage: z.number().int().min(1, 'Minimum storage is 1 MB'),
  ports: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  startCommand: z.string().optional(),
  variables: z.string().optional(),
});

// ── Image Management ────────────────────────────────────────────────────────

export const createImageSchema = z.object({
  name: z.string().min(1, 'Image name is required').max(128),
  description: z.string().max(500).optional(),
  egg: z.string().optional(),
  dockerImage: z.string().min(1, 'Docker image is required'),
  startup: z.string().optional(),
  variables: z.array(z.object({
    name: z.string(),
    env: z.string(),
    type: z.enum(['boolean', 'text', 'number']),
    default: z.union([z.string(), z.number(), z.boolean()]),
  })).optional(),
});

// ── Settings ────────────────────────────────────────────────────────────────

export const updateSettingsSchema = z.object({
  app_name: z.string().max(128).optional(),
  app_url: z.string().url().optional(),
  registration_enabled: z.boolean().optional(),
  server_limit_default: z.number().int().min(0).optional(),
  default_memory: z.number().int().min(0).optional(),
  default_cpu: z.number().int().min(0).optional(),
  default_storage: z.number().int().min(0).optional(),
  enforce_daemon_https: z.boolean().optional(),
  rate_limit_enabled: z.boolean().optional(),
  rate_limit_window: z.number().int().min(1000).optional(),
  rate_limit_max: z.number().int().min(1).optional(),
});

// ── API Keys ────────────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(128),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
  expiresAt: z.string().datetime().optional(),
});
