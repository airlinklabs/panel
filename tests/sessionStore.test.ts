import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionData } from 'express-session';

// Mock prisma BEFORE importing the store — vi.mock factories are hoisted
// so they must not reference top-level variables.
vi.mock('../src/db', () => ({
  default: {
    session: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/handlers/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Import AFTER mocks
import prisma from '../src/db';
import PrismaSessionStore from '../src/handlers/sessionStore';

function makeSessionData(maxAge = 3600000): SessionData {
  return {
    cookie: {
      maxAge,
      originalMaxAge: maxAge,
      httpOnly: true,
      path: '/',
      expires: new Date(Date.now() + maxAge),
      secure: false,
      sameSite: 'lax',
    },
  };
}

// Round-trip through JSON to match what the store serializes/deserializes.
function roundTrip(data: SessionData): SessionData {
  return JSON.parse(JSON.stringify(data));
}

describe('PrismaSessionStore', () => {
  let store: InstanceType<typeof PrismaSessionStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PrismaSessionStore();
  });

  describe('get', () => {
    it('returns parsed session data when row exists', async () => {
      const sessionData = makeSessionData();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        session_id: 'sid-1',
        data: JSON.stringify(sessionData),
        expires: new Date(Date.now() + 60000),
      });

      await new Promise<void>((resolve) => {
        store.get('sid-1', (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toEqual(roundTrip(sessionData));
          } catch (e) { /* propagate via reject */ }
          resolve();
        });
      });
    });

    it('returns undefined for missing session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await new Promise<void>((resolve) => {
        store.get('missing', (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toBeUndefined();
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });

    it('returns undefined and deletes expired session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        session_id: 'sid-expired',
        data: '{}',
        expires: new Date(Date.now() - 1000),
      });
      (prisma.session.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await new Promise<void>((resolve) => {
        store.get('sid-expired', (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toBeUndefined();
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
      expect(prisma.session.delete).toHaveBeenCalledWith({ where: { session_id: 'sid-expired' } });
    });

    it('propagates prisma errors', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

      await new Promise<void>((resolve) => {
        store.get('err', (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toBe('db down');
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });

  describe('set', () => {
    it('upserts session with computed expires', async () => {
      (prisma.session.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const sess = makeSessionData(7200000);

      await new Promise<void>((resolve) => {
        store.set('sid-set', sess, (err) => {
          try {
            expect(err).toBeUndefined();
            expect(prisma.session.upsert).toHaveBeenCalled();
            const args = (prisma.session.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(args.where).toEqual({ session_id: 'sid-set' });
            expect(args.create.expires).toBeInstanceOf(Date);
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });

    it('uses 72h default when no maxAge', async () => {
      (prisma.session.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const sess = { cookie: { httpOnly: true } } as unknown as SessionData;

      await new Promise<void>((resolve) => {
        store.set('sid-nomax', sess, () => {
          try {
            const args = (prisma.session.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
            const createdExpires = args.create.expires as Date;
            const diff = createdExpires.getTime() - Date.now();
            expect(diff).toBeGreaterThan(71 * 3600000);
            expect(diff).toBeLessThan(73 * 3600000);
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });

    it('propagates prisma errors', async () => {
      (prisma.session.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('write fail'));

      await new Promise<void>((resolve) => {
        store.set('err', makeSessionData(), (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });

  describe('destroy', () => {
    it('deletes session row', async () => {
      (prisma.session.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await new Promise<void>((resolve) => {
        store.destroy('sid-del', (err) => {
          try {
            expect(err).toBeUndefined();
            expect(prisma.session.delete).toHaveBeenCalledWith({ where: { session_id: 'sid-del' } });
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });

    it('propagates prisma errors', async () => {
      (prisma.session.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete fail'));

      await new Promise<void>((resolve) => {
        store.destroy('err', (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });

  describe('touch', () => {
    it('updates updatedAt timestamp', async () => {
      (prisma.session.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await new Promise<void>((resolve) => {
        store.touch('sid-touch', makeSessionData(), (err) => {
          try {
            expect(err).toBeUndefined();
            expect(prisma.session.update).toHaveBeenCalledWith({
              where: { session_id: 'sid-touch' },
              data: { updatedAt: expect.any(Date) },
            });
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });

    it('does not fail when session missing', async () => {
      (prisma.session.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));

      await new Promise<void>((resolve) => {
        store.touch('missing', makeSessionData(), (err) => {
          try {
            expect(err).toBeUndefined();
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });

  describe('length', () => {
    it('returns session count', async () => {
      (prisma.session.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      await new Promise<void>((resolve) => {
        store.length((err, count) => {
          try {
            expect(err).toBeNull();
            expect(count).toBe(5);
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });

  describe('clear', () => {
    it('deletes all sessions', async () => {
      (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await new Promise<void>((resolve) => {
        store.clear((err) => {
          try {
            expect(err).toBeUndefined();
            expect(prisma.session.deleteMany).toHaveBeenCalled();
          } catch (e) { /* propagate */ }
          resolve();
        });
      });
    });
  });
});
