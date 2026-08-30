import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import express, { Router } from "express";

// Mock prisma, logger and the daemon HTTP client before importing modules.
vi.mock("../src/db", () => ({
  default: {
    users: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock("../src/handlers/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../src/handlers/utils/core/daemonRequest", () => ({
  daemonRequest: vi.fn(),
  daemonBaseUrl: vi.fn(async () => "http://127.0.0.1:8080"),
}));

import prisma from "../src/db";
import { daemonRequest } from "../src/handlers/utils/core/daemonRequest";
import { registerFilesRoutes } from "../src/modules/user/server/files";
import { registerFileDetailRoutes } from "../src/modules/user/server/fileDetail";

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);

interface FakeSession {
  user?: { id: number; isAdmin?: boolean };
  destroy: (cb: (err?: Error | null) => void) => void;
}

function stubSession(user?: { id: number; isAdmin?: boolean }) {
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

const adminUser = {
  id: 1,
  isAdmin: true,
  username: "admin",
  email: "a@b.c",
  description: "",
};
const serverFixture = {
  UUID: "srv-abc",
  node: { address: "127.0.0.1", port: 8080, key: "nodekey" },
  image: null,
  owner: adminUser,
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(stubSession({ id: 1, isAdmin: true }));
  const router = Router();
  registerFilesRoutes(router);
  registerFileDetailRoutes(router);
  app.use(router);
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

describe("filesBackend copy / rename / rm guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.server.findUnique.mockResolvedValue(serverFixture as any);
    (mockPrisma.settings.findUnique as any).mockResolvedValue({
      uploadLimit: 100,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /server/:id/files/copy calls /fs/copy with a cleaned relative source and returns success", async () => {
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      data: { message: "duplicated", path: "world/foo-copy" },
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/files/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: "/world/foo" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        message: "duplicated",
        path: "world/foo-copy",
      });
      expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
      const options = mockDaemonRequest.mock.calls[0][0];
      expect(options.path).toBe("/fs/copy");
      expect(options.body).toEqual({ id: "srv-abc", source: "world/foo" });
    });
  });

  it("POST /server/:id/files/copy rejects an unsafe location (`..`) with 400 without hitting the daemon", async () => {
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/files/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: "../secret" }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });

  it("POST /server/:id/files/rename calls /fs/rename and maps a daemon error to the daemon status", async () => {
    mockDaemonRequest.mockRejectedValue(
      Object.assign(new Error("daemon refused"), {
        status: 422,
        body: { error: "Invalid name", status: 422 },
      }),
    );

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/srv-abc/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: "a.txt", newPath: "b.txt" }),
      });
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe("Invalid name");
      expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
      const options = mockDaemonRequest.mock.calls[0][0];
      expect(options.path).toBe("/fs/rename");
      expect(options.body).toEqual({
        id: "srv-abc",
        path: "a.txt",
        newName: "b.txt",
      });
    });
  });

  it("DELETE /server/:id/files/rm/{*path} rejects a path containing `..` with 400 without a daemon call", async () => {
    await withServer(buildApp(), async (base) => {
      // `a..b` contains `..` (so isPathSafe rejects it) but survives URL
      // normalization, which would otherwise collapse a bare `..` segment.
      const res = await fetch(`${base}/server/srv-abc/files/rm/a..b`, {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });

  it("GET /server/:id/files/download/{*path} mints a daemon token and 302s to the daemon instead of proxying bytes", async () => {
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      data: { token: "a".repeat(64), url: "/dl/a".repeat(64) },
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(
        `${base}/server/srv-abc/files/download/world/foo.txt`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      expect(location).toContain("127.0.0.1:8080/dl/");

      expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
      const options = mockDaemonRequest.mock.calls[0][0];
      expect(options.method).toBe("POST");
      expect(options.path).toBe("/fs/download-token");
      expect(options.body).toEqual({ id: "srv-abc", path: "world/foo.txt" });
    });
  });

  it("GET /server/:id/files/download/{*path} rejects an unsafe path with 400 without hitting the daemon", async () => {
    await withServer(buildApp(), async (base) => {
      const res = await fetch(
        `${base}/server/srv-abc/files/download/..%2F..%2Fetc%2Fpasswd`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(400);
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });
});

describe("files save route content validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockResolvedValue(adminUser as any);
    mockPrisma.server.findUnique.mockResolvedValue(serverFixture as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /server/:id/files/{*path} rejects a non-string content with 400", async () => {
    mockDaemonRequest.mockResolvedValue({ status: 200, data: {} } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(
        `${base}/server/srv-abc/files/edit/config.txt/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { not: "a string" } }),
        },
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Content is required");
      expect(mockDaemonRequest).not.toHaveBeenCalled();
    });
  });
});
