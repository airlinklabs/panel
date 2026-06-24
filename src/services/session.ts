import session from 'express-session';
import prisma from '../db';

// Use the express-session SessionData type directly
type SessionData = session.SessionData;

class PrismaSessionStore extends session.Store {
  async get(sid: string, callback: (err: Error | null, session?: SessionData) => void) {
    try {
      const row = await prisma.session.findUnique({ where: { session_id: sid } });
      callback(null, row ? (JSON.parse(row.data) as SessionData) : undefined);
    } catch (err) {
      callback(err as Error);
    }
  }

  async set(sid: string, sess: SessionData, callback: (err?: Error) => void) {
    try {
      const data = {
        session_id: sid,
        data: JSON.stringify(sess),
        expires: new Date(Date.now() + (sess.cookie?.maxAge || 3600000 * 72)),
      };
      await prisma.session.upsert({
        where: { session_id: sid },
        update: data,
        create: data,
      });
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  async destroy(sid: string, callback: (err?: Error) => void) {
    try {
      await prisma.session.delete({ where: { session_id: sid } });
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  async length(callback: (err: Error | null, length: number) => void) {
    try {
      const count = await prisma.session.count();
      callback(null, count);
    } catch (err) {
      callback(err as Error, 0);
    }
  }

  async clear(callback: (err?: Error) => void) {
    try {
      await prisma.session.deleteMany();
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  async touch(sid: string, _sess: SessionData, callback: () => void) {
    try {
      await prisma.session.update({
        where: { session_id: sid },
        data: { updatedAt: new Date() },
      });
      callback();
    } catch {
      callback();
    }
  }
}

export default PrismaSessionStore;
