import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";

// Mock prisma, logger and the daemon HTTP client before importing modules.
vi.mock("../../src/db", () => ({
  default: {
    node: { findMany: vi.fn(), count: vi.fn() },
    server: { count: vi.fn() },
    users: { count: vi.fn(), findUnique: vi.fn() },
    settings: { findUnique: vi.fn() },
    passwordReset: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../../src/handlers/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/handlers/utils/core/daemonRequest", () => ({
  daemonRequest: vi.fn(),
}));

const mockRedisOps = {
  zremrangebyscore: vi.fn().mockResolvedValue(0),
  zcard: vi.fn().mockResolvedValue(0),
  zadd: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
};
vi.mock("../../src/handlers/redis", () => ({
  getRedisClient: vi.fn(() => mockRedisOps),
}));

// Also mock the rate limiter module so passwordReset's rate limit actually works in-memory
let rateLimitCounts = new Map<string, number>();
vi.mock("../../src/handlers/utils/security/redisRateLimit", () => ({
  createRedisRateLimit: (opts: any) => {
    return (req: any, res: any, next: any) => {
      const ip = req.ip ?? "unknown";
      const key = `${opts.keyPrefix ?? "rl:"}:${ip}`;
      const count = (rateLimitCounts.get(key) ?? 0) + 1;
      rateLimitCounts.set(key, count);
      if (count > opts.max) {
        if (opts.handler) {
          opts.handler(req, res);
          return;
        }
        res.status(429).json(opts.message ?? { error: "Too many requests" });
        return;
      }
      next();
    };
  },
  redisRateLimit: (_req: any, _res: any, next: any) => next(),
}));

import coreModule from "../../src/modules/core/index";
import systemRouter from "../../src/modules/api/v2/system";
import authServiceModule from "../../src/modules/auth/authService";
import passwordResetModule from "../../src/modules/auth/passwordReset";
import prisma from "../../src/db";
import { daemonRequest } from "../../src/handlers/utils/core/daemonRequest";

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);

interface FakeSession {
  user?: { id: number };
  destroy: (cb: (err?: Error | null) => void) => void;
}

type SessionUser = { id: number; isAdmin: boolean };

function stripConnectSid(user: SessionUser | undefined) {
  return (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const session: FakeSession = {
      user: user ? { ...user } : undefined,
      destroy: vi.fn((cb) => cb(null)),
    };
    (req as any).session = session;
    (req as any).sessionUserHandle = session;
    next();
  };
}

function buildCoreApp(user?: SessionUser) {
  const app = express();
  app.use(express.json());
  app.use(stripConnectSid(user));
  app.use(coreModule.router());
  app.use("/api/v2/system", systemRouter);
  return app;
}

async function withServer(
  app: express.Express,
  fn: (base: string) => Promise<void>,
) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const adminUser = {
  id: 1,
  email: "admin@example.com",
  isAdmin: true,
  username: "admin",
  description: "",
};

describe("F-021 core admin/auth guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.settings.findUnique.mockResolvedValue({
      require2faForAdmins: false,
    } as any);
    mockPrisma.node.findMany.mockResolvedValue([]);
    mockPrisma.server.count.mockResolvedValue(0);
    mockPrisma.users.count.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated GET /api/system/status with a redirect", async () => {
    await withServer(buildCoreApp(undefined), async (base) => {
      const res = await fetch(`${base}/api/system/status`, {
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login");
      expect(mockPrisma.node.findMany).not.toHaveBeenCalled();
    });
  });

  it("accepts a logged-in admin on GET /api/system/status", async () => {
    await withServer(buildCoreApp({ id: 1, isAdmin: true }), async (base) => {
      const res = await fetch(`${base}/api/system/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.system).toBeDefined();
      expect(body.stats).toEqual({ servers: 0, users: 1, nodes: 0 });
    });
  });

  it("rejects unauthenticated POST /api/system/test-node-connection", async () => {
    await withServer(buildCoreApp(undefined), async (base) => {
      const res = await fetch(`${base}/api/system/test-node-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "10.0.0.5",
          port: 8080,
          key: "secret",
        }),
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });

  it("validates input on POST /api/system/test-node-connection", async () => {
    await withServer(buildCoreApp({ id: 1, isAdmin: true }), async (base) => {
      const badAddress = await fetch(
        `${base}/api/system/test-node-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: "   ", port: 8080, key: "secret" }),
        },
      );
      expect(badAddress.status).toBe(400);
      expect((await badAddress.json()).error).toBeTruthy();

      const badPort = await fetch(`${base}/api/system/test-node-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "10.0.0.5",
          port: 70000,
          key: "secret",
        }),
      });
      expect(badPort.status).toBe(400);

      const badKey = await fetch(`${base}/api/system/test-node-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "10.0.0.5", port: 8080, key: "" }),
      });
      expect(badKey.status).toBe(400);
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });

  it("probes a private/LAN node for an authenticated admin", async () => {
    mockDaemonRequest.mockResolvedValue({
      data: { status: "Online", versionRelease: "1.0.0", remote: false },
    } as any);

    await withServer(buildCoreApp({ id: 1, isAdmin: true }), async (base) => {
      const res = await fetch(`${base}/api/system/test-node-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "10.0.0.5",
          port: 8080,
          key: "secret",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps GET /api/health public", async () => {
    await withServer(buildCoreApp(undefined), async (base) => {
      const res = await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });
  });

  it("returns 401 JSON from /api/v2/system/search when unauthenticated", async () => {
    await withServer(buildCoreApp(undefined), async (base) => {
      const res = await fetch(`${base}/api/v2/system/search?q=abc`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });
});

describe("F-022 POST /reset-password rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.passwordReset.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 429 JSON after exceeding the per-IP limit", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = { destroy: vi.fn((cb: any) => cb(null)) };
      next();
    });
    app.use(passwordResetModule.router());

    await withServer(app, async (base) => {
      let lastStatus = 0;
      for (let i = 0; i < 11; i++) {
        const res = await fetch(`${base}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "x",
            password: "abc12345",
            confirmPassword: "abc12345",
          }),
        });
        lastStatus = res.status;
        if (res.status === 429) {
          expect(await res.json()).toEqual({
            error: "Too many attempts. Try again later.",
          });
        }
      }
      expect(lastStatus).toBe(429);
    });
  });
});

describe("F-024 canonical logout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps GET /logout as the canonical handler (browser uses a GET link)", async () => {
    const app = express();
    let session: FakeSession | undefined;
    app.use((req, _res, next) => {
      session = { user: { id: 1 }, destroy: vi.fn((cb: any) => cb(null)) };
      (req as any).session = session;
      next();
    });
    app.use(authServiceModule.router());

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/logout`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login");
      const setCookie = (res.headers.get("set-cookie") || "").toLowerCase();
      expect(setCookie).toContain("connect.sid");
      expect(session!.destroy).toHaveBeenCalled();
    });
  });

  it("removes the duplicate POST /logout (now 404)", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = {
        user: { id: 1 },
        destroy: vi.fn((cb: any) => cb(null)),
      };
      next();
    });
    // The canonical GET route lives in authServiceModule; authModule's POST was removed.
    app.use(authServiceModule.router());

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/logout`, {
        method: "POST",
        redirect: "manual",
      });
      expect(res.status).toBe(404);
    });
  });
});
