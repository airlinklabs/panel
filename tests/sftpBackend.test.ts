import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";

// Mock prisma, logger and the daemon HTTP client before importing the module.
vi.mock("../src/db", () => ({
  default: {
    users: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    sftpCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock("../src/handlers/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../src/handlers/utils/core/daemonRequest", () => ({
  daemonRequest: vi.fn(),
}));

import sftpModule from "../src/modules/user/sftp";
import prisma from "../src/db";
import { daemonRequest } from "../src/handlers/utils/core/daemonRequest";

const mockPrisma = vi.mocked(prisma);
const mockDaemonRequest = vi.mocked(daemonRequest);

function stripSession(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) {
  (req as any).session = { user: { id: 1 } };
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stripSession);
  app.use(sftpModule.router());
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

const NODE = { address: "10.0.0.5", port: 8080, key: "secret" };
const NODE_SERVER = { UUID: "node-123", node: NODE };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.users.findUnique.mockResolvedValue({
    id: 1,
    isAdmin: true,
  } as any);
  mockPrisma.server.findUnique.mockResolvedValue(NODE_SERVER as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F-PH6 SFTP credential lifecycle", () => {
  it("POST generates: calls the daemon, persists a hash, returns the plaintext password", async () => {
    mockPrisma.sftpCredential.findUnique.mockResolvedValue(null); // no existing credential
    mockPrisma.sftpCredential.upsert.mockResolvedValue({} as any);
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        username: "sftp-user",
        password: "plain-secret",
        port: 22,
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.username).toBe("sftp-user");
      expect(body.password).toBe("plain-secret"); // one-shot plaintext returned
      expect(body.host).toBe("10.0.0.5");
      expect(body.port).toBe(22);
    });

    expect(mockDaemonRequest).toHaveBeenCalledTimes(1);
    expect(mockDaemonRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/sftp/credentials",
        body: { id: "node-123" },
      }),
    );

    expect(mockPrisma.sftpCredential.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockPrisma.sftpCredential.upsert.mock.calls[0][0];
    const create = upsertArgs.create as { password: string; serverId: string };
    expect(create.serverId).toBe("node-123");
    expect(create.password).not.toBe("plain-secret"); // stored value is a bcrypt hash
    expect(create.password.startsWith("$2")).toBe(true);
  });

  it("POST / returns 502 and does not persist when the daemon payload is malformed", async () => {
    mockPrisma.sftpCredential.findUnique.mockResolvedValue(null);
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: { error: "boom" }, // missing username/password
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`, {
        method: "POST",
      });
      expect(res.status).toBe(502);
    });

    expect(mockPrisma.sftpCredential.upsert).not.toHaveBeenCalled();
  });

  it("POST / returns a 502 surfaced message when the daemon errors (non-2xx)", async () => {
    mockPrisma.sftpCredential.findUnique.mockResolvedValue(null);
    mockDaemonRequest.mockResolvedValue({
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      data: { error: "daemon exploded" },
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`, {
        method: "POST",
      });
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: string }).error).toBe(
        "daemon exploded",
      );
    });

    expect(mockPrisma.sftpCredential.upsert).not.toHaveBeenCalled();
  });

  it("DELETE /server/:id/sftp/credentials calls the daemon and clears the stored row", async () => {
    mockPrisma.sftpCredential.deleteMany.mockResolvedValue({ count: 1 } as any);
    mockDaemonRequest.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {},
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { message: string }).message).toBe(
        "SFTP credentials revoked.",
      );
    });

    expect(mockDaemonRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/sftp/credentials",
        body: { id: "node-123" },
      }),
    );
    expect(mockPrisma.sftpCredential.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.sftpCredential.deleteMany).toHaveBeenCalledWith({
      where: { serverId: "node-123" },
    });
  });

  it("GET /server/:id/sftp/credentials returns 404 when none are stored", async () => {
    mockPrisma.sftpCredential.findUnique.mockResolvedValue(null);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toContain(
        "No credentials",
      );
    });
  });

  it("GET /server/:id/sftp/credentials never returns the password hash", async () => {
    mockPrisma.sftpCredential.findUnique.mockResolvedValue({
      id: 1,
      serverId: "node-123",
      username: "sftp-user",
      password: "$2a$12$hashedsecretvalue",
      host: "10.0.0.5",
      port: 22,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    } as any);

    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/server/node-123/sftp/credentials`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.password).toBeUndefined();
      expect(body.username).toBe("sftp-user");
      expect(body.host).toBe("10.0.0.5");
    });
  });
});
