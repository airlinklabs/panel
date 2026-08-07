import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Server as HttpServer } from 'node:http';
import { isActivityRateLimited, resetActivityRateLimitForTests, activityRateLimitKey } from '../src/handlers/utils/activity/activityLogger';

vi.mock('../src/db', () => ({
  default: {
    activityLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    server: { findMany: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

import activityModule from '../src/modules/admin/activity';
import prisma from '../src/db';

function makeSession(id: number) {
  return { user: { id, email: 'a@b.c', isAdmin: true, username: 'admin', description: '' } };
}

describe('activity rate limiter', () => {
  beforeEach(() => {
    resetActivityRateLimitForTests();
  });

  it('allows logs up to the window cap', () => {
    const key = 'user:1';
    const capped = Array.from({ length: 120 }, () => isActivityRateLimited(key));
    expect(capped.filter(Boolean)).toHaveLength(0);
  });

  it('rejects once the cap is exceeded', () => {
    const key = 'user:2';
    for (let i = 0; i < 120; i++) {isActivityRateLimited(key);}
    expect(isActivityRateLimited(key)).toBe(true);
  });

  it('isolates buckets per actor', () => {
    for (let i = 0; i < 120; i++) {isActivityRateLimited('user:3');}
    expect(isActivityRateLimited('user:3')).toBe(true);
    expect(isActivityRateLimited('user:4')).toBe(false);
  });

  it('falls back to IP when unauthenticated', () => {
    const req = { session: undefined, socket: { remoteAddress: '10.0.0.9' }, headers: {} } as unknown as express.Request;
    expect(activityRateLimitKey(req)).toBe('ip:10.0.0.9');
  });

  it('uses the actor id when authenticated', () => {
    const req = { session: makeSession(7), headers: {} } as unknown as express.Request;
    expect(activityRateLimitKey(req)).toBe('user:7');
  });
});

describe('admin activity module', () => {
  let app: express.Express;
  let listener: HttpServer | undefined;
  const adminUser = { id: 1, email: 'a@b.c', isAdmin: true, username: 'admin', description: '' };
  const activityLogMock = vi.fn();
  let sessionUser: unknown;

  const buildApp = () => {
    const app = express();
    app.set('views', 'views');
    app.set('view engine', 'ejs');
    app.use(express.json());
    app.use((req, res, next) => {
      (req as any).session = sessionUser ? { user: sessionUser } : {};
      (req as any).translations = {};
      (req as any).lang = 'en';
      (req as any).originalUrl = '/admin/activity';
      res.locals.nonce = 'test-nonce';
      res.locals.csrfToken = 'test-csrf';
      res.locals.icon = (name: string, opts?: Record<string, unknown>) =>
        `<svg data-icon="${name}" ${opts?.class ? `class="${opts.class}"` : ''}></svg>`;
      res.locals.adminMenuItems = [];
      res.locals.regularMenuItems = [];
      res.locals.name = 'Airlink';
      res.locals.airlinkVersion = 'test';
      res.locals.airlinkCodename = 'test';
      res.locals.isMobileViewport = false;
      next();
    });
    app.use('/', activityModule.router());
    return app;
  };

  async function request(url: string): Promise<Response> {
    if (!listener) {
      listener = app.listen(0);
      await new Promise<void>((resolve) => listener!.once('listening', resolve));
    }
    const { port } = listener.address() as { port: number };
    return fetch(`http://127.0.0.1:${port}${url}`, { redirect: 'manual' });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityRateLimitForTests();
    if (listener) {
      listener.close();
      listener = undefined;
    }
    sessionUser = { ...adminUser, totpEnabled: true };
    activityLogMock.mockClear();
    prisma.activityLog.count.mockResolvedValue(0);
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.activityLog.groupBy.mockResolvedValue([]);
    prisma.users.findUnique.mockResolvedValue(adminUser);
    prisma.users.findMany.mockResolvedValue([]);
    prisma.server.findMany.mockResolvedValue([{ UUID: 'abc-123', name: 'Test Node' }]);
    prisma.settings.findUnique.mockResolvedValue({
      title: 'Airlink',
      logo: '/assets/logo.png',
      favicon: '/favicon.ico',
      lightTheme: 'default',
      darkTheme: 'default',
      panelWallpaper: null,
    });
    app = buildApp();
  });

  it('renders the activity page for an authenticated admin', async () => {
    const res = await request('/admin/activity');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Activity Log');
    expect(body).toContain('Test Node');
  });

  it('redirects unauthenticated users to login', async () => {
    sessionUser = undefined;
    app = buildApp();
    const res = await request('/admin/activity');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('builds a date-range filter from from/to params', async () => {
    prisma.activityLog.count.mockResolvedValue(0);
    const res = await request('/admin/activity?from=2026-08-01&to=2026-08-07');
    expect(res.status).toBe(200);
    const call = prisma.activityLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    const createdAt = call.where.createdAt as { gte?: Date; lte?: Date };
    expect(createdAt).toBeDefined();
    expect(createdAt?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(createdAt?.lte?.toISOString()).toBe('2026-08-07T23:59:59.999Z');
  });

  it('passes server and actor filters through to the query', async () => {
    const res = await request('/admin/activity?server=abc-123&actor=bob');
    expect(res.status).toBe(200);
    const call = prisma.activityLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.serverId).toBe('abc-123');
    expect(prisma.users.findMany).toHaveBeenCalled();
  });
});
