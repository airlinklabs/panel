/**
 * Feature-local validation schemas for the auth feature.
 *
 * Handlers parse untrusted request bodies through these schemas before doing
 * any work. The schemas mirror the panel's historical validation rules and
 * error semantics exactly (see authService.ts), so no browser-facing
 * behavior changes. Zod guarantees a single, normalized error path.
 */

import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]{3,20}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * POST /login body. `identifier` accepts either an email or a username.
 * Both fields are required; empty values fail with `missing`.
 */
export const loginSchema = z.object({
  identifier: z.string({ error: 'missing' }).min(1, { error: 'missing' }),
  password: z.string({ error: 'missing' }).min(1, { error: 'missing' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * POST /register body. Order of checks matters: presence first, then
 * email/password format (shared `invalid_input` error), then username format
 * (distinct `invalid_username` error) — matching the historical behavior.
 */
export const registerSchema = z
  .object({
    email: z.string({ error: 'missing' }).min(1, { error: 'missing' }),
    username: z.string({ error: 'missing' }).min(1, { error: 'missing' }),
    password: z.string({ error: 'missing' }).min(1, { error: 'missing' }),
  })
  .superRefine((value, ctx) => {
    if (!EMAIL_REGEX.test(value.email) || !PASSWORD_REGEX.test(value.password)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_input', path: ['email'] });
    }
    if (!USERNAME_REGEX.test(value.username)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_username', path: ['username'] });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export type AuthValidationError = 'missing' | 'invalid_input' | 'invalid_username';

/**
 * Normalizes a schema failure into the panel's redirect error parameter.
 * Presence errors win over format errors; format errors preserve their
 * historical distinct codes.
 */
export function authValidationErrorCode(issues: z.ZodIssue[]): AuthValidationError {
  const missing = issues.some((issue) => issue.message === 'missing');
  if (missing) {return 'missing';}
  const invalidInput = issues.some((issue) => issue.message === 'invalid_input');
  const invalidUsername = issues.some((issue) => issue.message === 'invalid_username');
  if (invalidInput) {return 'invalid_input';}
  if (invalidUsername) {return 'invalid_username';}
  return 'invalid_input';
}
