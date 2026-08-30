import { describe, it, expect } from "vitest";
import {
  CLIENT_API_VERSION,
  powerBodySchema,
  writeFileBodySchema,
  deleteFileBodySchema,
  renameFileBodySchema,
  createBackupBodySchema,
  createScheduleBodySchema,
  clientServerSchema,
  clientBackupSchema,
  clientScheduleSchema,
} from "../src/modules/api/client/dto";

function firstMessage(
  schema: {
    safeParse(data: unknown): {
      success: boolean;
      error?: { issues: { message: string }[] };
    };
  },
  data: unknown,
): string | undefined {
  const result = schema.safeParse(data);
  if (result.success) {
    return undefined;
  }
  return result.error?.issues[0]?.message;
}

describe("powerBodySchema", () => {
  it("accepts each valid action", () => {
    for (const action of ["start", "stop", "restart", "kill"]) {
      expect(powerBodySchema.safeParse({ action }).success).toBe(true);
    }
  });

  it("rejects an unknown action", () => {
    const result = powerBodySchema.safeParse({ action: "explode" });
    expect(result.success).toBe(false);
    expect(firstMessage(powerBodySchema, { action: "explode" })).toContain(
      "start",
    );
  });

  it("rejects a missing action", () => {
    expect(powerBodySchema.safeParse({}).success).toBe(false);
  });

  it("narrows the parsed output to the typed PowerBody", () => {
    const result = powerBodySchema.parse({ action: "start" });
    expect(result.action).toBe("start");
  });
});

describe("writeFileBodySchema", () => {
  it("accepts a file path and content", () => {
    const result = writeFileBodySchema.safeParse({
      file: "/a.txt",
      content: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty-string content (legacy only rejected undefined)", () => {
    expect(
      writeFileBodySchema.safeParse({ file: "/a.txt", content: "" }).success,
    ).toBe(true);
  });

  it("rejects a missing field", () => {
    const msg1 = firstMessage(writeFileBodySchema, { file: "/a.txt" });
    const msg2 = firstMessage(writeFileBodySchema, { content: "x" });
    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();
  });
});

describe("deleteFileBodySchema", () => {
  it("accepts a file path", () => {
    expect(deleteFileBodySchema.safeParse({ file: "/a.txt" }).success).toBe(
      true,
    );
  });

  it("rejects a missing file", () => {
    expect(firstMessage(deleteFileBodySchema, {})).toBeDefined();
  });
});

describe("renameFileBodySchema", () => {
  it("accepts file and newname", () => {
    expect(
      renameFileBodySchema.safeParse({ file: "/a.txt", newname: "b.txt" })
        .success,
    ).toBe(true);
  });

  it("rejects a missing field", () => {
    expect(
      firstMessage(renameFileBodySchema, { file: "/a.txt" }),
    ).toBeDefined();
  });
});

describe("createBackupBodySchema", () => {
  it("accepts a name", () => {
    expect(createBackupBodySchema.safeParse({ name: "daily" }).success).toBe(
      true,
    );
  });

  it("rejects a missing name", () => {
    expect(firstMessage(createBackupBodySchema, {})).toBeDefined();
  });
});

describe("createScheduleBodySchema", () => {
  it("accepts a command schedule without payload", () => {
    const result = createScheduleBodySchema.safeParse({
      name: "x",
      cron: "0 * * * *",
      action: "command",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.payload).toBeUndefined();
  });

  it("accepts a power schedule with a valid payload", () => {
    const result = createScheduleBodySchema.safeParse({
      name: "x",
      cron: "0 * * * *",
      action: "power",
      payload: '{"action":"restart"}',
    });
    expect(result.success).toBe(true);
  });

  it("rejects a power schedule with an invalid payload action (B-1)", () => {
    const result = createScheduleBodySchema.safeParse({
      name: "x",
      cron: "0 * * * *",
      action: "power",
      payload: '{"action":"explode"}',
    });
    expect(result.success).toBe(false);
    expect(
      firstMessage(createScheduleBodySchema, {
        name: "x",
        cron: "0 * * * *",
        action: "power",
        payload: '{"action":"explode"}',
      }),
    ).toBe("power payload must include a valid action");
  });

  it("rejects missing required fields", () => {
    expect(firstMessage(createScheduleBodySchema, { name: "x" })).toBeDefined();
  });

  it("rejects an unknown action", () => {
    expect(
      firstMessage(createScheduleBodySchema, {
        name: "x",
        cron: "* * * * *",
        action: "delete",
      }),
    ).toContain("command");
  });
});

describe("response DTOs", () => {
  it("clientServerSchema matches the server list wire shape", () => {
    const raw = {
      UUID: "abc",
      name: "Test",
      description: null,
      Installing: false,
      Queued: false,
      Suspended: false,
      nodeId: 1,
      createdAt: new Date(),
    };
    expect(clientServerSchema.safeParse(raw).success).toBe(true);
  });

  it("clientBackupSchema uses a string size on the wire", () => {
    const raw = {
      UUID: "b",
      name: "x",
      createdAt: new Date(),
      locked: false,
      size: "1024",
    };
    expect(clientBackupSchema.safeParse(raw).success).toBe(true);
  });

  it("clientScheduleSchema matches the schedule list wire shape", () => {
    const raw = {
      id: 1,
      name: "daily",
      cron: "0 4 * * *",
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      createdAt: new Date(),
      tasks: [
        { id: 1, action: "power", payload: '{"action":"restart"}', order: 0 },
      ],
    };
    expect(clientScheduleSchema.safeParse(raw).success).toBe(true);
  });

  it("exposes the documented wire version constant", () => {
    expect(CLIENT_API_VERSION).toBe("client-v2");
  });
});
