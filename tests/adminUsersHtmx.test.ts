import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server as HttpServer } from 'node:http';

// Mock prisma, logger, and activity logger before importing modules
vi.mock('../src/db', () => ({
  default: {
    users: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    server: { count: vi.fn() },
    session: { deleteMany: vi.fn() },
    loginHistory: { deleteMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/handlers/utils/activity/activityLogger', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../src/handlers/realtime/events', () => ({
  emitRealtime: vi.fn(),
  userEvent: vi.fn(),
}));

import prisma from '../src/db';
import usersModule from '../src/modules/admin/users';

const mockPrisma = vi.mocked(prisma);

const adminUser = {
  id: 1,
  isAdmin: true,
  totpEnabled: true,
  username: 'admin',
  email: 'admin@air.link',
  permissions: '[]',
  role: 'owner',
  avatar: null,
};

function stubSession(user: { id: number; isAdmin?: boolean; role?: string }) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).session = { user: { ...user } };
    next();
  };
}

function buildApp(): express.Express {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '../views'));
  app.use(express.json());
  app.use(stubSession({ id: 1, isAdmin: true, role: 'owner' }));

  // Add res.locals middleware for views
  app.use((req, res, next) => {
    res.locals.nonce = 'test-nonce';
    res.locals.name = 'Test Panel';
    res.locals.airlinkVersion = '2.0.0';
    res.locals.airlinkCodename = 'test';
    res.locals.icon = () => '';
    next();
  });

  app.use('/', usersModule.router());
  return app;
}

let listener: HttpServer | undefined;

async function request(app: express.Express, url: string, init?: RequestInit): Promise<Response> {
  if (!listener) {
    listener = app.listen(0);
    await new Promise<void>((resolve) => listener!.once('listening', resolve));
  }
  const { port } = listener.address() as { port: number };
  return fetch(`http://127.0.0.1:${port}${url}`, { ...init, redirect: 'manual' });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (listener) {
    listener.close();
    listener = undefined;
  }
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
    where?.id === 1 ? adminUser : null,
  );
  mockPrisma.users.findMany.mockResolvedValue([]);
  mockPrisma.users.count.mockResolvedValue(0);
  mockPrisma.server.count.mockResolvedValue(0);
  mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.loginHistory.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.settings.findUnique.mockResolvedValue({ title: 'Test Panel' });
});

afterEach(() => {
  if (listener) {
    listener.close();
    listener = undefined;
  }
});

describe('admin/users HTMX fragments', () => {
  describe('GET /admin/users', () => {
    it('returns fragment without document shell with HX-Request header', async () => {
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).not.toContain('<!DOCTYPE html>');
      expect(html).not.toMatch(/<html[\s>]/i);
      expect(html).not.toMatch(/<head[\s>]/i);
      expect(html).not.toMatch(/<body[\s>]/i);
      expect(html).toContain('id="admin-users-list"');
    });

    it('sets Vary: HX-Request header', async () => {
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      expect(res.headers.get('vary')).toContain('HX-Request');
    });

    it('fragment contains stable ID for swap target', async () => {
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(html).toMatch(/id="admin-users-list"/);
    });

    it('shows empty state when no users exist', async () => {
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(html).toContain('No users yet');
    });

    it('renders user rows when users exist', async () => {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: 2, username: 'player', email: 'player@air.link', avatar: null, isAdmin: false, role: 'user', servers: [] },
      ]);
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(html).toContain('id="admin-user-row-2"');
      expect(html).toContain('player');
    });
  });

  describe('POST /admin/users/create-user', () => {
    it('returns JSON without HX-Request header', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      mockPrisma.users.create.mockResolvedValue({ id: 9 });

      const res = await request(buildApp(), '/admin/users/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@air.link', username: 'newuser', password: 'CorrectP1' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('User created successfully.');
    });

    it('returns user-list fragment with HX-Trigger on success', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      mockPrisma.users.create.mockResolvedValue({ id: 9 });
      mockPrisma.users.findMany.mockResolvedValue([
        { id: 9, username: 'newuser', email: 'new@air.link', avatar: null, isAdmin: false, role: 'user', servers: [] },
      ]);

      const res = await request(buildApp(), '/admin/users/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HX-Request': 'true',
        },
        body: JSON.stringify({ email: 'new@air.link', username: 'newuser', password: 'CorrectP1' }),
      });
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('id="admin-users-list"');
      expect(html).toContain('newuser');

      const trigger = res.headers.get('hx-trigger');
      expect(trigger).toBeTruthy();
      const events = JSON.parse(trigger!);
      expect(events.al.toast.type).toBe('success');
      expect(events.al.toast.message).toBe('User created');
    });

    it('returns form fragment with errors on duplicate', async () => {
      mockPrisma.users.findFirst.mockResolvedValue({ id: 4 });

      const res = await request(buildApp(), '/admin/users/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HX-Request': 'true',
        },
        body: JSON.stringify({ email: 'dup@air.link', username: 'dupuser', password: 'CorrectP1' }),
      });
      const html = await res.text();
      expect(res.status).toBe(422);
      expect(html).toContain('id="admin-users-create-form"');
      expect(html).toContain('Email or username already exists');
    });

    it('returns error on invalid input (parseBody middleware catches validation)', async () => {
      const res = await request(buildApp(), '/admin/users/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HX-Request': 'true',
        },
        body: JSON.stringify({ email: 'bad', username: 'x', password: '123' }),
      });
      // parseBody middleware returns JSON validation errors before the route handler
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message || data.error).toBeDefined();
    });
  });

  describe('DELETE /admin/users/delete/:id/', () => {
    it('returns JSON without HX-Request header', async () => {
      mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === 1) return adminUser;
        if (where?.id === 2) return { id: 2, username: 'player', isAdmin: false, role: 'user' };
        return null;
      });

      const res = await request(buildApp(), '/admin/users/delete/2/', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('User deleted successfully.');
    });

    it('returns user-list fragment with HX-Trigger on success', async () => {
      mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === 1) return adminUser;
        if (where?.id === 2) return { id: 2, username: 'player', isAdmin: false, role: 'user' };
        return null;
      });
      mockPrisma.users.findMany.mockResolvedValue([]);

      const res = await request(buildApp(), '/admin/users/delete/2/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('id="admin-users-list"');

      const trigger = res.headers.get('hx-trigger');
      expect(trigger).toBeTruthy();
      const events = JSON.parse(trigger!);
      expect(events.al.toast.type).toBe('success');
      expect(events.al.toast.message).toBe('User deleted');
    });

    it('returns error fragment when deleting self', async () => {
      const res = await request(buildApp(), '/admin/users/delete/1/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(400);
      expect(html).toContain('Cannot delete your own account');
    });

    it('returns error fragment when user not found', async () => {
      const res = await request(buildApp(), '/admin/users/delete/999/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(404);
      expect(html).toContain('User not found');
    });

    it('returns error fragment when deleting last admin', async () => {
      mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === 1) return adminUser;
        if (where?.id === 3) return { id: 3, username: 'boss', isAdmin: true, role: 'admin' };
        return null;
      });
      mockPrisma.users.count.mockResolvedValue(1);

      const res = await request(buildApp(), '/admin/users/delete/3/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(400);
      expect(html).toContain('Cannot delete the last admin account');
    });

    it('returns error fragment when user owns servers', async () => {
      mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === 1) return adminUser;
        if (where?.id === 2) return { id: 2, username: 'player', isAdmin: false, role: 'user' };
        return null;
      });
      mockPrisma.server.count.mockResolvedValue(3);

      const res = await request(buildApp(), '/admin/users/delete/2/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(res.status).toBe(409);
      expect(html).toContain('Cannot delete user: they own servers');
    });
  });

  describe('Fragment invariants', () => {
    it('fragment does not include document shell', async () => {
      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(html).not.toMatch(/<html[\s>]/i);
      expect(html).not.toMatch(/<head[\s>]/i);
      expect(html).not.toMatch(/<body[\s>]/i);
      expect(html).not.toContain('<!DOCTYPE');
    });

    it('user-list fragment has unique section ID', async () => {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: 2, username: 'a', email: 'a@air.link', avatar: null, isAdmin: false, role: 'user', servers: [] },
        { id: 3, username: 'b', email: 'b@air.link', avatar: null, isAdmin: true, role: 'admin', servers: [] },
      ]);

      const res = await request(buildApp(), '/admin/users', {
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();

      // The fragment has exactly one admin-users-list section
      const sectionMatches = html.match(/id="admin-users-list"/g) || [];
      expect(sectionMatches.length).toBe(1);

      // Row IDs exist (mobile + desktop both render, so each appears twice)
      expect(html).toContain('id="admin-user-row-2"');
      expect(html).toContain('id="admin-user-row-3"');
    });

    it('error fragment has role="alert" for accessibility', async () => {
      mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === 1) return adminUser;
        return null;
      });

      const res = await request(buildApp(), '/admin/users/delete/999/', {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      });
      const html = await res.text();
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
    });
  });
});
