import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  isValidAddonSlug,
  resolveAddonViewPath,
} from "../src/handlers/addonViewResolver";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-resolver-"));
  fs.mkdirSync(path.join(root, "demo-addon", "views", "nested"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "demo-addon", "views", "index.ejs"),
    "<h1>hi</h1>",
  );
  fs.writeFileSync(
    path.join(root, "demo-addon", "views", "nested", "page.ejs"),
    "<p>n</p>",
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("isValidAddonSlug", () => {
  it("accepts well-formed slugs", () => {
    expect(isValidAddonSlug("demo-addon")).toBe(true);
    expect(isValidAddonSlug("a")).toBe(true);
    expect(isValidAddonSlug("my-addon-123")).toBe(true);
  });

  it("rejects unsafe or malformed slugs", () => {
    expect(isValidAddonSlug("..")).toBe(false);
    expect(isValidAddonSlug(".")).toBe(false);
    expect(isValidAddonSlug("a/../../etc")).toBe(false);
    expect(isValidAddonSlug("has spaces")).toBe(false);
    expect(isValidAddonSlug("UPPERCASE")).toBe(false);
    expect(isValidAddonSlug("")).toBe(false);
    expect(isValidAddonSlug("a".repeat(49))).toBe(false);
    expect(isValidAddonSlug(42)).toBe(false);
    expect(isValidAddonSlug(null)).toBe(false);
  });
});

describe("resolveAddonViewPath", () => {
  it("resolves a flat view inside the addon", () => {
    const resolved = resolveAddonViewPath(root, "demo-addon", "index.ejs");
    expect(resolved).toBe(path.join(root, "demo-addon", "views", "index.ejs"));
  });

  it("resolves a nested view inside the addon", () => {
    const resolved = resolveAddonViewPath(
      root,
      "demo-addon",
      "nested/page.ejs",
    );
    expect(resolved).toBe(
      path.join(root, "demo-addon", "views", "nested", "page.ejs"),
    );
  });

  it("returns null for traversal via the view name", () => {
    expect(
      resolveAddonViewPath(root, "demo-addon", "../../etc/passwd"),
    ).toBeNull();
    expect(
      resolveAddonViewPath(root, "demo-addon", "nested/../../index.ejs"),
    ).toBeNull();
    expect(
      resolveAddonViewPath(root, "demo-addon", "../demo-addon/views/index.ejs"),
    ).toBeNull();
    expect(
      resolveAddonViewPath(root, "demo-addon", "index.ejs/../../../etc/passwd"),
    ).toBeNull();
  });

  it("returns null for an absolute view name", () => {
    expect(resolveAddonViewPath(root, "demo-addon", "/etc/passwd")).toBeNull();
    expect(
      resolveAddonViewPath(root, "demo-addon", "C:\\windows\\evil"),
    ).toBeNull();
  });

  it("returns null for a malicious slug regardless of view", () => {
    expect(resolveAddonViewPath(root, "..", "index.ejs")).toBeNull();
    expect(resolveAddonViewPath(root, "a/../../..", "index.ejs")).toBeNull();
    expect(resolveAddonViewPath(root, ".hidden", "index.ejs")).toBeNull();
  });

  it("returns null for null-byte and empty names", () => {
    expect(resolveAddonViewPath(root, "demo-addon", "index.ejs\0")).toBeNull();
    expect(resolveAddonViewPath(root, "demo-addon", "")).toBeNull();
  });

  it("returns null when the view does not exist", () => {
    expect(resolveAddonViewPath(root, "demo-addon", "missing.ejs")).toBeNull();
    expect(
      resolveAddonViewPath(root, "nonexistent-addon", "index.ejs"),
    ).toBeNull();
  });
});
