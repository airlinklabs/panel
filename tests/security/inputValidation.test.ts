import { describe, it, expect } from "vitest";
import {
  isValidPort,
  parseImagePortRequirements,
  parseServerPorts,
  validatePortAssignments,
} from "../../src/handlers/utils/server/ports";

describe("port validation security", () => {
  describe("isValidPort edge cases", () => {
    it("rejects negative numbers", () => {
      expect(isValidPort(-1)).toBe(false);
      expect(isValidPort(-65535)).toBe(false);
    });

    it("rejects zero", () => {
      expect(isValidPort(0)).toBe(false);
    });

    it("rejects above 65535", () => {
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(999999)).toBe(false);
    });

    it("rejects floats", () => {
      expect(isValidPort(1.5)).toBe(false);
      expect(isValidPort(25565.1)).toBe(false);
    });

    it("rejects NaN", () => {
      expect(isValidPort(NaN)).toBe(false);
    });

    it("rejects Infinity", () => {
      expect(isValidPort(Infinity)).toBe(false);
      expect(isValidPort(-Infinity)).toBe(false);
    });

    it("accepts boundary values", () => {
      expect(isValidPort(1)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
    });
  });

  describe("parseImagePortRequirements injection attempts", () => {
    it("handles deeply nested JSON", () => {
      const result = parseImagePortRequirements('{"a":{"b":{"c":25565}}}');
      expect(result).toEqual([]);
    });

    it("handles extremely long strings", () => {
      const longArray = Array(1000)
        .fill(null)
        .map((_, i) => ({ name: `P${i}`, internalPort: 25565 }));
      const result = parseImagePortRequirements(JSON.stringify(longArray));
      expect(result.length).toBe(1000);
    });

    it("handles prototype pollution attempt", () => {
      const result = parseImagePortRequirements(
        '[{"__proto__":{"admin":true},"name":"test","internalPort":25565}]',
      );
      expect(result).toHaveLength(1);
      expect(({} as any).admin).toBeUndefined();
    });

    it("handles null bytes in JSON", () => {
      const result = parseImagePortRequirements(
        '[{"name":"test\\u0000injected","internalPort":25565}]',
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("test");
    });

    it("handles extremely large port numbers", () => {
      const result = parseImagePortRequirements(
        '[{"name":"test","internalPort":999999999999}]',
      );
      expect(result).toEqual([]);
    });

    it("handles negative port numbers", () => {
      const result = parseImagePortRequirements(
        '[{"name":"test","internalPort":-1}]',
      );
      expect(result).toEqual([]);
    });
  });

  describe("parseServerPorts injection attempts", () => {
    it("handles prototype pollution via Port field", () => {
      const result = parseServerPorts('[{"Port":"__proto__:25565"}]');
      expect(result).toEqual([]);
    });

    it("handles extremely long Port strings", () => {
      const result = parseServerPorts(
        `[{"Port":"${"9".repeat(100)}:${"9".repeat(100)}"}]`,
      );
      expect(result).toEqual([]);
    });

    it("handles SQL injection in Port field", () => {
      const result = parseServerPorts(
        '[{"Port":"1; DROP TABLE servers;--:25565"}]',
      );
      expect(result).toEqual([]);
    });

    it("handles XSS in port name", () => {
      const result = parseServerPorts(
        '[{"name":"<script>alert(1)</script>","Port":"25565:25565"}]',
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("<script>");
    });

    it("handles unicode in Port field", () => {
      const result = parseServerPorts('[{"Port":"١٢٣٤٥:25565"}]');
      expect(result).toEqual([]);
    });
  });

  describe("validatePortAssignments security", () => {
    const allocated = [25565, 25566, 25567];

    it("prevents duplicate port allocation", () => {
      const ports = [
        { name: "P1", internalPort: 25565, externalPort: 25565, primary: true },
        {
          name: "P2",
          internalPort: 25565,
          externalPort: 25565,
          primary: false,
        },
      ];
      const result = validatePortAssignments(ports, allocated, [], 1);
      expect(result).toContain("more than once");
    });

    it("prevents allocation of unallocated ports", () => {
      const ports = [
        { name: "P1", internalPort: 9999, externalPort: 9999, primary: true },
      ];
      const result = validatePortAssignments(ports, allocated, [], 1);
      expect(result).toContain("not allocated");
    });

    it("prevents allocation of already-used ports", () => {
      const ports = [
        { name: "P1", internalPort: 25565, externalPort: 25565, primary: true },
      ];
      const result = validatePortAssignments(ports, allocated, [25565], 1);
      expect(result).toContain("already in use");
    });

    it("prevents empty port names", () => {
      const ports = [
        { name: "", internalPort: 25565, externalPort: 25565, primary: true },
      ];
      const result = validatePortAssignments(ports, allocated, [], 1);
      expect(result).toContain("name");
    });

    it("prevents whitespace-only port names", () => {
      const ports = [
        {
          name: "   ",
          internalPort: 25565,
          externalPort: 25565,
          primary: true,
        },
      ];
      const result = validatePortAssignments(ports, allocated, [], 1);
      expect(result).toContain("name");
    });

    it("enforces minimum port count", () => {
      const result = validatePortAssignments([], allocated, [], 3);
      expect(result).toContain("At least 3 port(s)");
    });

    it("allows exactly minimum ports", () => {
      const ports = [
        { name: "P1", internalPort: 25565, externalPort: 25565, primary: true },
        {
          name: "P2",
          internalPort: 25566,
          externalPort: 25566,
          primary: false,
        },
        {
          name: "P3",
          internalPort: 25567,
          externalPort: 25567,
          primary: false,
        },
      ];
      const result = validatePortAssignments(ports, allocated, [], 3);
      expect(result).toBeNull();
    });
  });
});
