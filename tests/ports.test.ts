import { describe, it, expect } from "vitest";
import {
  isValidPort,
  parseImagePortRequirements,
  parseServerPorts,
  normalizeServerPorts,
  serializeServerPorts,
  portsToDaemonString,
  getPrimaryExternalPort,
  getUsedExternalPorts,
  validatePortAssignments,
  pickRandomFreePorts,
} from "../src/handlers/utils/server/ports";

describe("isValidPort", () => {
  it("accepts valid ports", () => {
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(25565)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });

  it("rejects invalid ports", () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(1.5)).toBe(false);
    expect(isValidPort(NaN)).toBe(false);
  });
});

describe("parseImagePortRequirements", () => {
  it("parses valid JSON array", () => {
    const result = parseImagePortRequirements(
      '[{"name":"Game","internalPort":25565}]',
    );
    expect(result).toEqual([{ name: "Game", internalPort: 25565 }]);
  });

  it("returns empty array for null/undefined/empty", () => {
    expect(parseImagePortRequirements(null)).toEqual([]);
    expect(parseImagePortRequirements(undefined)).toEqual([]);
    expect(parseImagePortRequirements("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseImagePortRequirements("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseImagePortRequirements("{}")).toEqual([]);
  });

  it("filters out invalid ports", () => {
    const result = parseImagePortRequirements(
      '[{"name":"Valid","internalPort":25565},{"name":"Invalid","internalPort":99999}]',
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Valid");
  });

  it("uses default name when missing", () => {
    const result = parseImagePortRequirements('[{"internalPort":25565}]');
    expect(result[0].name).toBe("Port 1");
  });
});

describe("parseServerPorts", () => {
  it("parses modern format", () => {
    const result = parseServerPorts(
      '[{"name":"Game","internalPort":25565,"externalPort":25565,"primary":true}]',
    );
    expect(result).toEqual([
      { name: "Game", internalPort: 25565, externalPort: 25565, primary: true },
    ]);
  });

  it('parses legacy Port format "ext:int"', () => {
    const result = parseServerPorts('[{"Port":"25565:25565","primary":true}]');
    expect(result).toEqual([
      {
        name: "Port 1",
        internalPort: 25565,
        externalPort: 25565,
        primary: true,
      },
    ]);
  });

  it("parses legacy Port format with different ports", () => {
    const result = parseServerPorts('[{"Port":"25566:25565"}]');
    expect(result).toEqual([
      {
        name: "Port 1",
        internalPort: 25565,
        externalPort: 25566,
        primary: true,
      },
    ]);
  });

  it("defaults primary to true for first port", () => {
    const result = parseServerPorts('[{"Port":"25565:25565"}]');
    expect(result[0].primary).toBe(true);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseServerPorts("bad json")).toEqual([]);
  });

  it("filters out invalid ports", () => {
    const result = parseServerPorts('[{"Port":"99999:25565"}]');
    expect(result).toEqual([]);
  });
});

describe("normalizeServerPorts", () => {
  it("normalizes array input", () => {
    const result = normalizeServerPorts([
      {
        name: "Game",
        internalPort: "25565",
        externalPort: "25565",
        primary: true,
      },
    ]);
    expect(result).toEqual([
      { name: "Game", internalPort: 25565, externalPort: 25565, primary: true },
    ]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeServerPorts(null)).toEqual([]);
    expect(normalizeServerPorts(undefined)).toEqual([]);
    expect(normalizeServerPorts("string")).toEqual([]);
  });
});

describe("serializeServerPorts", () => {
  it("serializes ports with legacy Port field", () => {
    const result = JSON.parse(
      serializeServerPorts([
        {
          name: "Game",
          internalPort: 25565,
          externalPort: 25565,
          primary: true,
        },
      ]),
    );
    expect(result[0].Port).toBe("25565:25565");
    expect(result[0].name).toBe("Game");
  });

  it("forces first port as primary", () => {
    const result = JSON.parse(
      serializeServerPorts([
        {
          name: "P1",
          internalPort: 25565,
          externalPort: 25565,
          primary: false,
        },
        { name: "P2", internalPort: 25566, externalPort: 25566, primary: true },
      ]),
    );
    expect(result[0].primary).toBe(true);
    expect(result[1].primary).toBe(true);
  });
});

describe("portsToDaemonString", () => {
  it("converts to daemon format", () => {
    expect(portsToDaemonString('[{"Port":"25565:25565"}]')).toBe("25565:25565");
  });

  it("handles multiple ports", () => {
    expect(
      portsToDaemonString('[{"Port":"25565:25565"},{"Port":"25566:25566"}]'),
    ).toBe("25565:25565,25566:25566");
  });

  it("returns empty string for invalid input", () => {
    expect(portsToDaemonString(null)).toBe("");
  });
});

describe("getPrimaryExternalPort", () => {
  it("returns primary port", () => {
    expect(
      getPrimaryExternalPort('[{"Port":"25565:25565","primary":true}]'),
    ).toBe(25565);
  });

  it("returns first port if no primary", () => {
    expect(getPrimaryExternalPort('[{"Port":"25565:25565"}]')).toBe(25565);
  });

  it("returns undefined for empty/invalid", () => {
    expect(getPrimaryExternalPort(null)).toBeUndefined();
  });
});

describe("getUsedExternalPorts", () => {
  it("collects ports from multiple servers", () => {
    const servers = [
      { Ports: '[{"Port":"25565:25565"}]' },
      { Ports: '[{"Port":"25566:25566"}]' },
    ];
    expect(getUsedExternalPorts(servers)).toEqual([25565, 25566]);
  });

  it("returns empty array for no servers", () => {
    expect(getUsedExternalPorts([])).toEqual([]);
  });
});

describe("pickRandomFreePorts", () => {
  const pool = [25565, 25566, 25567, 25568, 25569];

  it("returns the requested number of free ports", () => {
    const picked = pickRandomFreePorts(pool, [], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    picked.forEach((port) => expect(pool).toContain(port));
  });

  it("never picks used ports", () => {
    const picked = pickRandomFreePorts(pool, [25565, 25567], 2);
    expect(picked).not.toContain(25565);
    expect(picked).not.toContain(25567);
  });

  it("returns fewer when not enough free ports", () => {
    const picked = pickRandomFreePorts(pool, [25565, 25566, 25567, 25568], 3);
    expect(picked).toHaveLength(1);
    expect(picked).toEqual([25569]);
  });

  it("spreads picks across the pool over many calls", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      pickRandomFreePorts(pool, [], 1).forEach((port) => seen.add(port));
    }
    // Randomness should eventually touch more than one pool port.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("returns empty array when the pool is fully used", () => {
    expect(pickRandomFreePorts(pool, pool, 1)).toEqual([]);
  });
});

describe("validatePortAssignments", () => {
  const allocated = [25565, 25566, 25567];
  const ports = [
    { name: "Game", internalPort: 25565, externalPort: 25565, primary: true },
  ];

  it("returns null for valid assignment", () => {
    expect(validatePortAssignments(ports, allocated, [], 1)).toBeNull();
  });

  it("rejects when too few ports", () => {
    expect(validatePortAssignments([], allocated, [], 1)).toContain(
      "At least 1 port",
    );
  });

  it("rejects unallocated port", () => {
    const bad = [
      { name: "Game", internalPort: 9999, externalPort: 9999, primary: true },
    ];
    expect(validatePortAssignments(bad, allocated, [], 1)).toContain(
      "not allocated",
    );
  });

  it("rejects already-used port", () => {
    expect(validatePortAssignments(ports, allocated, [25565], 1)).toContain(
      "already in use",
    );
  });

  it("rejects duplicate port", () => {
    const dup = [
      { name: "P1", internalPort: 25565, externalPort: 25565, primary: true },
      { name: "P2", internalPort: 25565, externalPort: 25565, primary: false },
    ];
    expect(validatePortAssignments(dup, allocated, [], 1)).toContain(
      "more than once",
    );
  });

  it("rejects empty name", () => {
    const noName = [
      { name: "", internalPort: 25565, externalPort: 25565, primary: true },
    ];
    expect(validatePortAssignments(noName, allocated, [], 1)).toContain("name");
  });

  it("rejects invalid internal port", () => {
    const bad = [
      { name: "Game", internalPort: 0, externalPort: 25565, primary: true },
    ];
    expect(validatePortAssignments(bad, allocated, [], 1)).toContain(
      "Internal port",
    );
  });
});
