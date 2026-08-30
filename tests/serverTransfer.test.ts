import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../src/db", () => ({
  default: {
    server: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    node: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock daemonRequest
vi.mock("../src/handlers/utils/core/daemonRequest", () => ({
  daemonRequest: vi.fn(),
}));

// Mock allocations
vi.mock("../src/handlers/utils/server/allocations", () => ({
  claimNodePorts: vi.fn().mockResolvedValue(1),
  releaseServerAllocations: vi.fn().mockResolvedValue(undefined),
  getNodePortPool: vi.fn().mockResolvedValue([25565, 25566]),
  withNodePortLock: vi
    .fn()
    .mockImplementation((_nodeId: number, task: () => Promise<any>) => task()),
}));

// Mock resourceCheck
vi.mock("../src/handlers/utils/server/resourceCheck", () => ({
  assertNodeCapacity: vi.fn().mockResolvedValue(undefined),
}));

// Mock ports
vi.mock("../src/handlers/utils/server/ports", () => ({
  normalizeServerPorts: vi.fn().mockImplementation((ports) => ports),
  parseImagePortRequirements: vi.fn().mockReturnValue([]),
  parseServerPorts: vi
    .fn()
    .mockReturnValue([
      { externalPort: 25565, internalPort: 25565, primary: true, name: "Game" },
    ]),
  serializeServerPorts: vi
    .fn()
    .mockReturnValue('[{"Port":"25565:25565","primary":true}]'),
  validatePortAssignments: vi.fn().mockReturnValue(null),
  getUsedExternalPorts: vi.fn().mockReturnValue([]),
}));

import { getTransferState } from "../src/handlers/utils/server/serverTransfer";

describe("serverTransfer state management", () => {
  it("getTransferState returns undefined for non-existent transfer", () => {
    expect(getTransferState(999)).toBeUndefined();
  });
});
