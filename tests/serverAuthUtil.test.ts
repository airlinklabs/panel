import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { WebSocket } from "ws";

vi.mock("../src/db", () => ({
  default: {
    users: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    subUser: { findUnique: vi.fn() },
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

vi.mock("../src/handlers/errorPages", () => ({
  renderErrorPage: vi.fn(),
}));

import prisma from "../src/db";
import { renderErrorPage } from "../src/handlers/errorPages";
import {
  isAuthenticatedForServer,
  isAuthenticatedForServerWS,
  requireSubUserPermission,
  subUserHasPermission,
  parseSubUserPermissions,
} from "../src/handlers/utils/auth/serverAuthUtil";

const mockPrisma = vi.mocked(prisma);
const mockRenderErrorPage = vi.mocked(renderErrorPage);

function fakeReq(
  params: Record<string, string | undefined> = {},
  sessionUser?: { id: number },
) {
  const req = {
    params,
    session: sessionUser ? { user: sessionUser } : undefined,
    redirect: vi.fn(),
  } as unknown as Request;
  return req;
}

function fakeRes() {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

function fakeNext() {
  return vi.fn() as NextFunction;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subUser authorization contract", () => {
  it("attaches the typed req.subUser for subuser access (HTTP)", async () => {
    const nonAdmin = { id: 1, isAdmin: false };
    const subUserRow = {
      id: 7,
      serverId: "abc",
      userId: 1,
      permissions: '["console"]',
      createdAt: new Date(),
    };
    mockPrisma.users.findUnique.mockResolvedValue(nonAdmin);
    mockPrisma.server.findUnique.mockResolvedValue({
      UUID: "abc",
      ownerId: 99,
      Suspended: false,
    });
    mockPrisma.subUser.findUnique.mockResolvedValue(subUserRow);

    const middleware = isAuthenticatedForServer("id");
    const req = fakeReq({ id: "abc" }, { id: 1 });
    const res = fakeRes();
    const next = fakeNext();

    await middleware(req, res, next);

    expect(req.subUser).toEqual(subUserRow);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.redirect).not.toHaveBeenCalled();
  });

  it("does not attach subUser for owners", async () => {
    const owner = { id: 2, isAdmin: false };
    mockPrisma.users.findUnique.mockResolvedValue(owner);
    mockPrisma.server.findUnique.mockResolvedValue({
      UUID: "abc",
      ownerId: 2,
      Suspended: false,
    });

    const middleware = isAuthenticatedForServer("id");
    const req = fakeReq({ id: "abc" }, { id: 2 });
    const res = fakeRes();
    const next = fakeNext();

    await middleware(req, res, next);

    expect(req.subUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("attaches req.subUser for subuser access over websocket", async () => {
    const nonAdmin = { id: 1, isAdmin: false };
    const subUserRow = {
      id: 9,
      serverId: "abc",
      userId: 1,
      permissions: "[]",
      createdAt: new Date(),
    };
    mockPrisma.users.findUnique.mockResolvedValue(nonAdmin);
    mockPrisma.server.findUnique.mockResolvedValue({
      UUID: "abc",
      ownerId: 99,
      Suspended: false,
    });
    mockPrisma.subUser.findUnique.mockResolvedValue(subUserRow);

    const ws = { close: vi.fn() } as unknown as WebSocket;
    const middleware = isAuthenticatedForServerWS("id");
    const req = fakeReq({ id: "abc" }, { id: 1 });
    const next = fakeNext();

    await middleware(ws, req, next);

    expect(req.subUser).toEqual(subUserRow);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated requests to /login", async () => {
    const middleware = isAuthenticatedForServer("id");
    const req = fakeReq({ id: "abc" });
    const res = fakeRes();
    const next = fakeNext();

    await middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks suspended servers for non-admin owners", async () => {
    const owner = { id: 2, isAdmin: false };
    mockPrisma.users.findUnique.mockResolvedValue(owner);
    mockPrisma.server.findUnique.mockResolvedValue({
      UUID: "abc",
      ownerId: 2,
      Suspended: true,
    });

    const middleware = isAuthenticatedForServer("id");
    const req = fakeReq({ id: "abc" }, { id: 2 });
    const res = fakeRes();
    const next = fakeNext();

    await middleware(req, res, next);

    expect(mockRenderErrorPage).toHaveBeenCalledWith(
      req,
      res,
      403,
      "This server is suspended.",
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireSubUserPermission", () => {
  it("passes through for owners/admins (no subUser attached)", () => {
    const req = fakeReq({ id: "abc" }, { id: 2 });
    const res = fakeRes();
    const next = fakeNext();

    requireSubUserPermission("files")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRenderErrorPage).not.toHaveBeenCalled();
  });

  it("passes through when the subUser has the permission", () => {
    const req = fakeReq({ id: "abc" }, { id: 2 });
    req.subUser = {
      id: 7,
      serverId: "abc",
      userId: 2,
      permissions: '["files.read","files.write"]',
      createdAt: new Date(),
    };
    const res = fakeRes();
    const next = fakeNext();

    requireSubUserPermission("files.read")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("renders a 403 when the subUser lacks the permission", () => {
    const req = fakeReq({ id: "abc" }, { id: 2 });
    req.subUser = {
      id: 7,
      serverId: "abc",
      userId: 2,
      permissions: '["console"]',
      createdAt: new Date(),
    };
    const res = fakeRes();
    const next = fakeNext();

    requireSubUserPermission("files")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockRenderErrorPage).toHaveBeenCalledWith(req, res, 403);
  });

  it("honors wildcard permission groups (files.* grants files.read)", () => {
    const req = fakeReq({ id: "abc" }, { id: 2 });
    req.subUser = {
      id: 7,
      serverId: "abc",
      userId: 2,
      permissions: '["files.*"]',
      createdAt: new Date(),
    };
    const res = fakeRes();
    const next = fakeNext();

    requireSubUserPermission("files.read")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("permission parsing", () => {
  it("parses JSON permission strings", () => {
    expect(parseSubUserPermissions('["console","files.read"]')).toEqual([
      "console",
      "files.read",
    ]);
  });

  it("returns [] for invalid or missing input", () => {
    expect(parseSubUserPermissions(null)).toEqual([]);
    expect(parseSubUserPermissions("not-json")).toEqual([]);
    expect(parseSubUserPermissions("{}")).toEqual([]);
  });

  it("matches parent group permissions", () => {
    const subUser = { permissions: '["files"]' };
    expect(subUserHasPermission(subUser, "files.read")).toBe(true);
  });

  it("does not grant unrelated permissions", () => {
    const subUser = { permissions: '["console"]' };
    expect(subUserHasPermission(subUser, "files")).toBe(false);
  });
});
