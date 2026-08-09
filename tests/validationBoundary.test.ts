import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import {
  parseBody,
  parseParams,
  parseQuery,
  validationErrorBoundary,
  ValidationError,
} from '../src/utils/validation';
import { createUserSchema, updateUserSchema } from '../src/modules/admin/schemas';

describe('validation boundary (parseBody/parseParams/parseQuery)', () => {
  let app: express.Express;
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().min(0),
    });

    app.post(
      '/body',
      parseBody(schema),
      (req, res) => {
        const body = req.validatedBody as { name: string; age: number };
        res.json({ name: body.name, age: body.age });
      },
    );
    app.get(
      '/params/:id',
      parseParams(z.object({ id: z.string().regex(/^\d+$/) })),
      (req, res) => {
        const params = req.validatedParams as { id: string };
        res.json({ id: params.id });
      },
    );
    app.get(
      '/query',
      parseQuery(z.object({ page: z.coerce.number().int().min(1) })),
      (req, res) => {
        const query = req.validatedQuery as { page: number };
        res.json({ page: query.page });
      },
    );
    app.use(validationErrorBoundary);
    app.use((_req, res) => res.status(500).json({ error: 'unhandled' }));

    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('passes valid body through typed', async () => {
    const resp = await fetch(`${baseUrl}/body`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'node', age: 3 }),
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ name: 'node', age: 3 });
  });

  it('returns the standardized 400 for an invalid body', async () => {
    const resp = await fetch(`${baseUrl}/body`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', age: -1 }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { message: string; error: string; errors: { field: string; message: string }[] };
    expect(body.message).toBeTruthy();
    expect(body.error).toBe(body.message);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.some((e) => e.field === 'name')).toBe(true);
    expect(body.errors.some((e) => e.field === 'age')).toBe(true);
  });

  it('validates params with a consistent error body', async () => {
    const resp = await fetch(`${baseUrl}/params/abc`);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('validates query strings', async () => {
    const ok = await fetch(`${baseUrl}/query?page=2`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ page: 2 });

    const bad = await fetch(`${baseUrl}/query?page=0`);
    expect(bad.status).toBe(400);
  });

  it('boundary forwards non-validation errors to next', async () => {
    const sentinel = new Error('boom');
    let called = false;
    const boundary = (err: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
      validationErrorBoundary(err as never, _req, _res, next);
    };
    const next = (err?: unknown) => {
      expect(err).toBe(sentinel);
      called = true;
    };
    boundary(sentinel, {} as express.Request, {} as express.Response, next);
    expect(called).toBe(true);
  });

  it('ValidationError carries its issues', () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({ x: 1 });
    if (result.success) {throw new Error('expected failure');}
    const error = new ValidationError(result.error.issues);
    expect(error.issues).toEqual(result.error.issues);
    expect(error.name).toBe('ValidationError');
  });
});

describe('createUserSchema', () => {
  it('accepts a valid payload and normalizes the core fields', () => {
    const r = createUserSchema.safeParse({
      email: 'user@example.com',
      username: 'alice',
      password: 'password1',
      isAdmin: true,
      role: 'admin',
      serverLimit: 5,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('user@example.com');
      expect(r.data.username).toBe('alice');
      expect(r.data.password).toBe('password1');
      expect(r.data.serverLimit).toBe(5);
    }
  });

  it('rejects missing core fields with the legacy message', () => {
    const r = createUserSchema.safeParse({ email: 'user@example.com' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Missing required fields: email, username, or password.');
    }
  });

  it('rejects a bad email with the legacy message', () => {
    const r = createUserSchema.safeParse({ email: 'not-an-email', username: 'alice', password: 'password1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Please provide a valid email address.');
    }
  });

  it('rejects a bad username with the legacy message', () => {
    const r = createUserSchema.safeParse({ email: 'user@example.com', username: 'a b', password: 'password1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Username must be 3–20 characters and contain only letters and numbers.');
    }
  });

  it('rejects a weak password with the legacy message', () => {
    const r = createUserSchema.safeParse({ email: 'user@example.com', username: 'alice', password: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Password must be at least 8 characters and contain at least one letter and one number.');
    }
  });

  it('first failing check wins (missing beats format)', () => {
    const r = createUserSchema.safeParse({ email: 'not-an-email' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Missing required fields: email, username, or password.');
    }
  });
});

describe('updateUserSchema', () => {
  it('accepts an empty patch (all optional)', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial valid changes', () => {
    const r = updateUserSchema.safeParse({ email: 'new@example.com' });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid email when provided', () => {
    const r = updateUserSchema.safeParse({ email: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Please provide a valid email address.');
    }
  });

  it('ignores a blank password (means no change)', () => {
    const r = updateUserSchema.safeParse({ password: '   ' });
    expect(r.success).toBe(true);
  });

  it('accepts numeric limit strings and null', () => {
    expect(updateUserSchema.safeParse({ serverLimit: null }).success).toBe(true);
    expect(updateUserSchema.safeParse({ maxMemory: '2048' }).success).toBe(true);
  });
});
