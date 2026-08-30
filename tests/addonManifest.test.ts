import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseAddonManifest,
  isReservedRoutePrefix,
} from "../src/handlers/addonManifest";

let root: string;

function writeAddon(slug: string, manifest: Record<string, unknown>): string {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  return dir;
}

const goodManifest = {
  name: "Demo Addon",
  identifier: "demo-addon",
  version: "1.0.0",
  main: "index.js",
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-manifest-"));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("parseAddonManifest", () => {
  it("accepts a valid addon", () => {
    const dir = writeAddon("demo-addon", goodManifest);
    const result = parseAddonManifest(
      path.join(dir, "package.json"),
      "demo-addon",
    );
    expect(result.success).toBe(true);
  });

  it("rejects a folder name that is not a valid slug", () => {
    const dir = writeAddon("has spaces", {
      ...goodManifest,
      identifier: "has-spaces",
    });
    const result = parseAddonManifest(
      path.join(dir, "package.json"),
      "has spaces",
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("slug");
  });

  it("rejects traversal-shaped folder names", () => {
    const dir = writeAddon("..", { ...goodManifest, identifier: "dotdot" });
    const result = parseAddonManifest(path.join(dir, "package.json"), "..");
    expect(result.success).toBe(false);
  });

  it("rejects an identifier that does not match the folder", () => {
    const dir = writeAddon("demo-addon", {
      ...goodManifest,
      identifier: "something-else",
    });
    const result = parseAddonManifest(
      path.join(dir, "package.json"),
      "demo-addon",
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Identifier mismatch");
  });

  it("rejects a reserved router prefix", () => {
    for (const router of ["/admin", "/api/v1", "/admin/whatever"]) {
      const slug = `r-${Math.random().toString(36).slice(2)}`;
      const dir = writeAddon(slug, {
        ...goodManifest,
        identifier: slug,
        router,
      });
      const result = parseAddonManifest(path.join(dir, "package.json"), slug);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error).toContain("Reserved route prefix");
    }
  });

  it("rejects permissions outside the addon namespace", () => {
    const dir = writeAddon("demo-addon", {
      ...goodManifest,
      permissions: ["airlink.admin.everything"],
    });
    const result = parseAddonManifest(
      path.join(dir, "package.json"),
      "demo-addon",
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toContain("outside addon namespace");
  });

  it("rejects reserved identifiers", () => {
    for (const identifier of ["admin", "api", "auth"]) {
      const dir = writeAddon(identifier, { ...goodManifest, identifier });
      const result = parseAddonManifest(
        path.join(dir, "package.json"),
        identifier,
      );
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error).toContain("Reserved identifier");
    }
  });
});

describe("isReservedRoutePrefix", () => {
  it("catches reserved prefixes with and without leading slash", () => {
    expect(isReservedRoutePrefix("/admin")).toBe(true);
    expect(isReservedRoutePrefix("admin")).toBe(true);
    expect(isReservedRoutePrefix("/api")).toBe(true);
    expect(isReservedRoutePrefix("/api/servers")).toBe(true);
    expect(isReservedRoutePrefix("/ws")).toBe(true);
  });

  it("allows a normal addon route prefix", () => {
    expect(isReservedRoutePrefix("/demo-addon")).toBe(false);
    expect(isReservedRoutePrefix("/demo-addon/config")).toBe(false);
    expect(isReservedRoutePrefix("/admin-not-reserved")).toBe(false);
  });
});
