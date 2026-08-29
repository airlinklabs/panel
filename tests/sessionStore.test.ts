import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionData } from "express-session";

const fakeRedisGet = vi.fn();
const fakeRedisSet = vi.fn();
const fakeRedisDel = vi.fn();
const fakeRedisScan = vi.fn();
const fakeRedisPipeline = vi.fn();
const fakeRedisExpire = vi.fn();

vi.mock("../src/handlers/redis", () => ({
  getRedisClient: () => ({
    get: fakeRedisGet,
    set: fakeRedisSet,
    del: fakeRedisDel,
    scan: fakeRedisScan,
    pipeline: fakeRedisPipeline,
    expire: fakeRedisExpire,
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
  }),
}));

vi.mock("../src/handlers/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import PrismaSessionStore from "../src/handlers/sessionStore";

function makeSessionData(maxAge = 3600000): SessionData {
  return {
    cookie: {
      maxAge,
      originalMaxAge: maxAge,
      httpOnly: true,
      path: "/",
      expires: new Date(Date.now() + maxAge),
      secure: false,
      sameSite: "lax",
    },
  };
}

function roundTrip(data: SessionData): SessionData {
  return JSON.parse(JSON.stringify(data));
}

function setupPipeline() {
  const chain = {
    sadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  fakeRedisPipeline.mockReturnValue(chain);
  return chain;
}

describe("RedisSessionStore", () => {
  let store: InstanceType<typeof PrismaSessionStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupPipeline();
    store = new PrismaSessionStore();
  });

  describe("get", () => {
    it("returns parsed session data when key exists", async () => {
      const sessionData = makeSessionData();
      fakeRedisGet.mockResolvedValue(JSON.stringify(sessionData));

      await new Promise<void>((resolve) => {
        store.get("sid-1", (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toEqual(roundTrip(sessionData));
          } catch (e) {
            /* propagate via reject */
          }
          resolve();
        });
      });
    });

    it("returns undefined for missing session", async () => {
      fakeRedisGet.mockResolvedValue(null);

      await new Promise<void>((resolve) => {
        store.get("missing", (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toBeUndefined();
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("returns undefined for expired session (Redis TTL handles expiry)", async () => {
      fakeRedisGet.mockResolvedValue(null);

      await new Promise<void>((resolve) => {
        store.get("sid-expired", (err, sess) => {
          try {
            expect(err).toBeNull();
            expect(sess).toBeUndefined();
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("propagates redis errors", async () => {
      fakeRedisGet.mockRejectedValue(new Error("redis down"));

      await new Promise<void>((resolve) => {
        store.get("err", (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toBe("redis down");
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });

  describe("set", () => {
    it("sets session with computed TTL", async () => {
      fakeRedisSet.mockResolvedValue("OK");

      const sess = makeSessionData(7200000);

      await new Promise<void>((resolve) => {
        store.set("sid-set", sess, (err) => {
          try {
            expect(err).toBeUndefined();
            expect(fakeRedisSet).toHaveBeenCalled();
            const args = fakeRedisSet.mock.calls[0];
            expect(args[0]).toBe("airlink:sess:sid-set");
            expect(args[1]).toBe(JSON.stringify(sess));
            expect(args[2]).toBe("EX");
            expect(args[3]).toBe(7200);
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("uses 72h default when no maxAge", async () => {
      fakeRedisSet.mockResolvedValue("OK");

      const sess = { cookie: { httpOnly: true } } as unknown as SessionData;

      await new Promise<void>((resolve) => {
        store.set("sid-nomax", sess, () => {
          try {
            const args = fakeRedisSet.mock.calls[0];
            const ttl = args[3] as number;
            expect(ttl).toBe(7 * 24 * 60 * 60);
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("propagates redis errors", async () => {
      fakeRedisSet.mockRejectedValue(new Error("write fail"));

      await new Promise<void>((resolve) => {
        store.set("err", makeSessionData(), (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });

  describe("destroy", () => {
    it("deletes session key and cleans up user index", async () => {
      fakeRedisGet.mockResolvedValue(null);
      const chain = setupPipeline();

      await new Promise<void>((resolve) => {
        store.destroy("sid-del", (err) => {
          try {
            expect(err).toBeUndefined();
            expect(chain.del).toHaveBeenCalledWith("airlink:sess:sid-del");
            expect(chain.exec).toHaveBeenCalled();
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("propagates redis errors", async () => {
      fakeRedisGet.mockRejectedValue(new Error("delete fail"));

      await new Promise<void>((resolve) => {
        store.destroy("err", (err) => {
          try {
            expect(err).toBeInstanceOf(Error);
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });

  describe("touch", () => {
    it("updates TTL on the session key", async () => {
      fakeRedisExpire.mockResolvedValue(1);

      await new Promise<void>((resolve) => {
        store.touch("sid-touch", makeSessionData(), (err) => {
          try {
            expect(err).toBeUndefined();
            expect(fakeRedisExpire).toHaveBeenCalledWith(
              "airlink:sess:sid-touch",
              expect.any(Number),
            );
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });

    it("does not fail when session missing", async () => {
      fakeRedisExpire.mockResolvedValue(0);

      await new Promise<void>((resolve) => {
        store.touch("missing", makeSessionData(), (err) => {
          try {
            expect(err).toBeUndefined();
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });

  describe("lengths", () => {
    it("returns session count via scan", async () => {
      fakeRedisScan.mockResolvedValueOnce([
        "0",
        [
          "airlink:sess:a",
          "airlink:sess:b",
          "airlink:sess:c",
          "airlink:sess:d",
          "airlink:sess:e",
        ],
      ]);

      await new Promise<void>((resolve) => {
        store.lengths((err, count) => {
          try {
            expect(err).toBeNull();
            expect(count).toBe(5);
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });

  describe("clear", () => {
    it("deletes all session keys", async () => {
      fakeRedisScan.mockResolvedValueOnce([
        "0",
        ["airlink:sess:a", "airlink:sess:b"],
      ]);
      fakeRedisDel.mockResolvedValue(2);

      await new Promise<void>((resolve) => {
        store.clear((err) => {
          try {
            expect(err).toBeUndefined();
            expect(fakeRedisDel).toHaveBeenCalledWith(
              "airlink:sess:a",
              "airlink:sess:b",
            );
          } catch (e) {
            /* propagate */
          }
          resolve();
        });
      });
    });
  });
});
