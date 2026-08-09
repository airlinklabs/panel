// ── Admin Route Input Validation Schemas ─────────────────────────────────────
// Feature-local Zod schemas for admin mutation routes. Mount with
// `parseBody` (src/utils/validation.ts) at the route edge so handlers read
// normalized typed input and failures flow to one consistent error boundary.
//
// These schemas mirror the panel's historical server-side validation rules and
// messages exactly (see the hand-rolled checks they replaced in users.ts). The
// first failing check wins, matching the old short-circuit behavior.

import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]{3,20}$/;
const PASSWORD_MIN_LENGTH = 8;
const LETTER_PATTERN = /[A-Za-z]/;
const NUMBER_PATTERN = /\d/;

/** A limit field: numbers, form-encoded strings, or null/empty (use default). */
const optionalLimit = z.union([z.number(), z.string(), z.null()]).optional();

// ── User Management ─────────────────────────────────────────────────────────

/**
 * POST /admin/users/create-user body. The three core fields are required and
 * validated in the same order and with the same messages as the legacy route.
 */
export const createUserSchema = z
  .object({
    email: z.unknown().optional(),
    username: z.unknown().optional(),
    password: z.unknown().optional(),
    isAdmin: z.union([z.boolean(), z.string()]).optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    serverLimit: optionalLimit,
    maxMemory: optionalLimit,
    maxCpu: optionalLimit,
    maxStorage: optionalLimit,
    maxDatabases: optionalLimit,
  })
  .superRefine((value, ctx) => {
    if (!value.email || !value.username || !value.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Missing required fields: email, username, or password.' });
      return;
    }
    if (typeof value.email !== 'string' || !EMAIL_REGEX.test(value.email)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please provide a valid email address.', path: ['email'] });
      return;
    }
    if (typeof value.username !== 'string' || !USERNAME_REGEX.test(value.username)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Username must be 3–20 characters and contain only letters and numbers.',
        path: ['username'],
      });
      return;
    }
    if (
      typeof value.password !== 'string' ||
      value.password.length < PASSWORD_MIN_LENGTH ||
      !LETTER_PATTERN.test(value.password) ||
      !NUMBER_PATTERN.test(value.password)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 8 characters and contain at least one letter and one number.',
        path: ['password'],
      });
    }
  })
  .transform((value) => {
    // superRefine guarantees the core fields are present, non-empty strings.
    const email = typeof value.email === 'string' ? value.email : '';
    const username = typeof value.username === 'string' ? value.username : '';
    const password = typeof value.password === 'string' ? value.password : '';
    return {
      email,
      username,
      password,
      isAdmin: value.isAdmin,
      role: value.role,
      description: value.description,
      serverLimit: value.serverLimit,
      maxMemory: value.maxMemory,
      maxCpu: value.maxCpu,
      maxStorage: value.maxStorage,
      maxDatabases: value.maxDatabases,
    };
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * POST /admin/users/update/:id/ body. All fields optional; a field is only
 * validated when present and (for password) non-blank, matching the legacy
 * "validate only what changed" behavior.
 */
export const updateUserSchema = z
  .object({
    email: z.unknown().optional(),
    username: z.unknown().optional(),
    password: z.unknown().optional(),
    isAdmin: z.union([z.boolean(), z.string()]).optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    serverLimit: optionalLimit,
    maxMemory: optionalLimit,
    maxCpu: optionalLimit,
    maxStorage: optionalLimit,
    maxDatabases: optionalLimit,
  })
  .superRefine((value, ctx) => {
    if (value.email && (typeof value.email !== 'string' || !EMAIL_REGEX.test(value.email))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please provide a valid email address.', path: ['email'] });
      return;
    }
    if (value.username && (typeof value.username !== 'string' || !USERNAME_REGEX.test(value.username))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Username must be 3–20 characters and contain only letters and numbers.',
        path: ['username'],
      });
      return;
    }
    if (
      value.password &&
      typeof value.password === 'string' &&
      value.password.trim() !== '' &&
      (value.password.length < PASSWORD_MIN_LENGTH ||
        !LETTER_PATTERN.test(value.password) ||
        !NUMBER_PATTERN.test(value.password))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 8 characters and contain at least one letter and one number.',
        path: ['password'],
      });
    }
  })
  .transform((value) => {
    const email = typeof value.email === 'string' ? value.email : undefined;
    const username = typeof value.username === 'string' ? value.username : undefined;
    const password = typeof value.password === 'string' ? value.password : undefined;
    return {
      email,
      username,
      password,
      isAdmin: value.isAdmin,
      role: value.role,
      description: value.description,
      serverLimit: value.serverLimit,
      maxMemory: value.maxMemory,
      maxCpu: value.maxCpu,
      maxStorage: value.maxStorage,
      maxDatabases: value.maxDatabases,
    };
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
