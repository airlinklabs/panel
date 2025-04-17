/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { PrismaClient } from '@prisma/client';
import session from 'express-session';

const prisma = new PrismaClient();

class PrismaSessionStore extends session.Store {
  async get(sid: string, callback: (err: any, session: any) => void) {
    try {
      const sessionData = await prisma.session.findUnique({
        where: { session_id: sid },
      });
      if (sessionData) {
        callback(null, JSON.parse(sessionData.data));
      } else {
        callback(null, null);
      }
    } catch (err) {
      callback(err, null);
    }
  }

  async set(sid: string, session: any, callback: (err?: any) => void) {
    try {
      const sessionData = {
        session_id: sid,
        data: JSON.stringify(session),
        expires: new Date(Date.now() + (session.cookie.maxAge || 3600000 * 72)),
      };

      await prisma.session.upsert({
        where: { session_id: sid },
        update: sessionData,
        create: sessionData,
      });

      callback();
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid: string, callback: (err?: any) => void) {
    try {
      await prisma.session.delete({
        where: { session_id: sid },
      });
      callback();
    } catch (err) {
      callback(err);
    }
  }

  async length(callback: (err: any, length: number) => void) {
    try {
      const count = await prisma.session.count();
      callback(null, count);
    } catch (err) {
      callback(err, 0);
    }
  }

  async clear(callback: (err?: any) => void) {
    try {
      await prisma.session.deleteMany();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  async touch(sid: string, session: any, callback: (err?: any) => void) {
    try {
      await prisma.session.update({
        where: { session_id: sid },
        data: {
          data: JSON.stringify(session),
          expires: new Date(Date.now() + (session.cookie.maxAge || 3600000)),
          updatedAt: new Date(),
        },
      });
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

export default PrismaSessionStore;
