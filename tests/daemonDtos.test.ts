import { describe, it, expect } from "vitest";
import {
  containerStatusSchema,
  daemonInfoSchema,
  fsFileEntrySchema,
  fsListSchema,
  daemonStateSchema,
  daemonPlayerListSchema,
  parseDaemonResponse,
} from "../src/platform/daemon/dtos";

describe("containerStatusSchema", () => {
  it("accepts the daemon /container/status response shape", () => {
    const raw = {
      running: true,
      exists: true,
      status: "running",
      exitCode: null,
      startedAt: "2026-08-09T10:00:00Z",
      finishedAt: "",
      source: "inspect",
    };
    expect(containerStatusSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts the daemon not-found response (running false, exists false)", () => {
    expect(
      containerStatusSchema.safeParse({ running: false, exists: false })
        .success,
    ).toBe(true);
  });

  it("rejects malformed running flag types", () => {
    expect(containerStatusSchema.safeParse({ running: "yes" }).success).toBe(
      false,
    );
  });
});

describe("daemonInfoSchema", () => {
  it("accepts the daemon root response", () => {
    const raw = {
      versionFamily: "2",
      versionRelease: "2.2.183",
      status: "Online",
      remote: false,
    };
    expect(daemonInfoSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts a minimal empty daemon response", () => {
    expect(daemonInfoSchema.safeParse({}).success).toBe(true);
  });
});

describe("fsListSchema", () => {
  it("accepts directory and file entries as the daemon emits them", () => {
    const raw = [
      {
        name: "world",
        type: "directory",
        extension: null,
        category: null,
        size: 0,
      },
      {
        name: "server.jar",
        type: "file",
        extension: "jar",
        category: "java",
        size: 12345,
      },
    ];
    expect(fsListSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts entries with only the fields old clients provide", () => {
    expect(fsListSchema.safeParse([{ name: "x", type: "file" }]).success).toBe(
      true,
    );
  });

  it("rejects a directory whose type is not file/directory", () => {
    expect(fsListSchema.safeParse([{ name: "x", type: "link" }]).success).toBe(
      false,
    );
  });

  it("rejects a non-array payload (e.g. an error object)", () => {
    expect(fsListSchema.safeParse({ error: "Too many requests" }).success).toBe(
      false,
    );
  });
});

describe("fsFileEntrySchema", () => {
  it("validates a single daemon entry", () => {
    const result = fsFileEntrySchema.safeParse({
      name: "a.log",
      type: "file",
      extension: "log",
      category: "log",
      size: 9,
    });
    expect(result.success).toBe(true);
  });
});

describe("daemonStateSchema", () => {
  it("accepts install-state payloads", () => {
    expect(daemonStateSchema.safeParse({ state: "installing" }).success).toBe(
      true,
    );
    expect(daemonStateSchema.safeParse({ state: "installed" }).success).toBe(
      true,
    );
    expect(
      daemonStateSchema.safeParse({ state: "failed", error: "boom" }).success,
    ).toBe(true);
  });
});

describe("daemonPlayerListSchema", () => {
  it("accepts a populated players payload", () => {
    const raw = {
      players: [
        { name: "Steve", uuid: "c8e7b7c0-9e8a-4f7b-8f0e-0a6f9d6b4f8a" },
      ],
      maxPlayers: 20,
      onlinePlayers: 1,
      description: "A Minecraft Server",
      version: "1.21",
      online: true,
    };
    expect(daemonPlayerListSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts the daemon EMPTY_RESPONSE for transient failures", () => {
    const raw = {
      players: [],
      maxPlayers: 0,
      onlinePlayers: 0,
      description: "",
      version: "",
      online: false,
    };
    expect(daemonPlayerListSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects players whose uuid is missing", () => {
    expect(
      daemonPlayerListSchema.safeParse({ players: [{ name: "Steve" }] })
        .success,
    ).toBe(false);
  });
});

describe("parseDaemonResponse", () => {
  it("validates an already-parsed object", () => {
    const result = parseDaemonResponse(containerStatusSchema, {
      running: true,
    });
    expect(result?.running).toBe(true);
  });

  it("validates a JSON string payload (legacy daemon endpoints)", () => {
    const result = parseDaemonResponse(
      fsListSchema,
      JSON.stringify([{ name: "a", type: "file" }]),
    );
    expect(result).toEqual([{ name: "a", type: "file" }]);
  });

  it("returns null for an invalid JSON string", () => {
    expect(parseDaemonResponse(fsListSchema, "not-json")).toBeNull();
  });

  it("returns null when the payload does not match the schema", () => {
    expect(
      parseDaemonResponse(containerStatusSchema, { running: "yes" }),
    ).toBeNull();
  });

  it("returns null for null/undefined input instead of throwing", () => {
    expect(parseDaemonResponse(containerStatusSchema, null)).toBeNull();
    expect(parseDaemonResponse(containerStatusSchema, undefined)).toBeNull();
  });
});
