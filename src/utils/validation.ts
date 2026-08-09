/**
 * Shared request-validation boundary.
 *
 * Feature-local Zod schemas parse params/query/body at the route edge, before
 * any handler or DB work. These helpers attach the parsed (normalized) input
 * to the request and hand validation failures to a single, consistent error
 * boundary. Raw request values are never trusted past this point — the typed
 * result of `safeParse` is the only thing a handler reads.
 *
 * The boundary emits a standardized 400 body:
 *
 *     { message, error, errors: [{ field, message }] }
 *
 * `message` and `error` both carry the first human-safe issue so existing
 * clients that read either key keep working unchanged. The `errors` array is
 * the machine-readable detail (empty for unknown validation sources).
 */

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import { ZodError } from 'zod';

/** First non-empty issue message, or a stable fallback. */
function firstIssueMessage(issues: z.ZodIssue[]): string {
  for (const issue of issues) {
    if (typeof issue.message === 'string' && issue.message.length > 0) {
      return issue.message;
    }
  }
  return 'Invalid request payload.';
}

/**
 * Error raised by the boundary middleware when schema validation fails.
 * Caught by the app-level `validationErrorBoundary` handler.
 */
export class ValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    super('Request validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** Serializes an unknown validation error into the standardized boundary body. */
function boundaryBody(error: ValidationError | ZodError): { message: string; error: string; errors: { field: string; message: string }[] } {
  const issues = error instanceof ZodError ? error.issues : error.issues;
  const message = firstIssueMessage(issues);
  return {
    message,
    error: message,
    errors: issues.map((issue) => ({
      field: issue.path.join('.'),
      message: typeof issue.message === 'string' ? issue.message : 'Invalid value.',
    })),
  };
}

export function parseBody<T>(schema: z.ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.validatedBody = result.data;
    next();
  };
}

export function parseParams<T>(schema: z.ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.validatedParams = result.data;
    next();
  };
}

export function parseQuery<T>(schema: z.ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

/**
 * App-level error boundary. Converts `ValidationError` (and bare `ZodError`)
 * into the standardized 400 response and forwards everything else untouched.
 * Mount after all routers so handler-thrown validation errors are caught too.
 */
export function validationErrorBoundary(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof ValidationError || error instanceof ZodError) {
    res.status(400).json(boundaryBody(error));
    return;
  }
  next(error);
}
