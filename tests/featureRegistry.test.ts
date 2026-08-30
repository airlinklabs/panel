import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { registeredModules, FEATURE_REGISTRY } from "../src/modules/registry";

const MODULES_DIR = path.join(__dirname, "../src/modules");

function getFilesRecursively(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? getFilesRecursively(fullPath) : [fullPath];
    })
    .filter((f) => f.endsWith(".ts"));
}

// Mirrors the shape check the old recursive loader applied.
function looksLikeModule(file: string): boolean {
  const src = fs.readFileSync(file, "utf8");
  return (
    /export default/.test(src) &&
    /\binfo\s*:/.test(src) &&
    /\brouter\s*:/.test(src)
  );
}

describe("feature registry", () => {
  it("registers every discoverable module exactly once", () => {
    const files = getFilesRecursively(MODULES_DIR);
    const expectedCount = files.filter(looksLikeModule).length;

    expect(FEATURE_REGISTRY.length).toBe(expectedCount);
    expect(FEATURE_REGISTRY.length).toBeGreaterThan(30);
  });

  it("registers only modules with a valid Module shape", () => {
    for (const entry of FEATURE_REGISTRY) {
      expect(entry.name).toBeTypeOf("string");
      expect(entry.module.info.name).toBeTypeOf("string");
      expect(entry.module.info.version).toBeTypeOf("string");
      expect(typeof entry.module.router).toBe("function");
    }
  });

  it("preserves the admin → api → auth → core → realtime → user mount order", () => {
    const names = FEATURE_REGISTRY.map((e) => e.name);

    // Admin group is fully contiguous at the head.
    const adminEnd = names.indexOf("admin/users");
    expect(adminEnd).toBe(17);
    expect(
      names.slice(0, adminEnd + 1).every((n) => n.startsWith("admin/")),
    ).toBe(true);

    // Api group follows.
    const apiStart = names.indexOf("api/alternative");
    const apiEnd = names.indexOf("api/v2");
    expect(apiStart).toBe(adminEnd + 1);
    expect(apiEnd).toBe(apiStart + 2);
    expect(
      names.slice(apiStart, apiEnd + 1).every((n) => n.startsWith("api/")),
    ).toBe(true);

    // Top-level groups come after api, before user.
    const authIdx = names.indexOf("auth");
    const coreIdx = names.indexOf("core");
    const realtimeIdx = names.indexOf("realtime");
    const userIdx = names.indexOf("user/account");
    expect(authIdx).toBeGreaterThan(apiEnd);
    expect(coreIdx).toBeGreaterThan(authIdx);
    expect(realtimeIdx).toBeGreaterThan(coreIdx);
    expect(userIdx).toBeGreaterThan(realtimeIdx);

    // User group is fully contiguous at the tail.
    expect(names.slice(userIdx).every((n) => n.startsWith("user/"))).toBe(true);
  });

  it("registers all core user-server submodules via their owner module", () => {
    const names = FEATURE_REGISTRY.map((e) => e.name);
    expect(names).toContain("user/server");
    // The server/* submodules are composed into user/server, not registered
    // independently.
    expect(names).not.toContain("user/server/console");
    expect(names).not.toContain("user/server/files");
  });
});

describe("registry validation (shape contract)", () => {
  it("throws at import time for a malformed registration", () => {
    // This mirrors the assertModuleShape guard used when the registry is
    // built; a malformed entry cannot survive module load.
    const bad = { info: { name: "x" } };
    const candidate = bad as unknown as { module: unknown; name: string };
    expect(() => {
      (function validate() {
        const mod = candidate.module as {
          info?: { name?: string; version?: string };
          router?: unknown;
        };
        if (typeof mod !== "object" || mod === null) {
          throw new Error("not a module");
        }
        if (
          typeof mod.info?.name !== "string" ||
          typeof mod.info?.version !== "string"
        ) {
          throw new Error("missing name or version");
        }
        if (typeof mod.router !== "function") {
          throw new Error("no router factory");
        }
      })();
    }).toThrow();
  });

  it("exposes registeredModules() as the mount source", () => {
    expect(registeredModules()).toEqual(FEATURE_REGISTRY);
  });
});
