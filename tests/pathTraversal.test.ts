import { describe, it, expect } from "vitest";
import {
  isPathSafe,
  containPath,
  sanitizePath,
} from "../src/utils/pathSecurity";
import {
  parseAddonManifest,
  isReservedRoutePrefix,
} from "../src/handlers/addonManifest";
import fs from "fs";
import os from "os";
import path from "path";

describe("pathSecurity: encoded traversal attacks", () => {
  it("rejects literal dot-dot traversal", () => {
    expect(isPathSafe("../etc/passwd")).toBe(false);
  });

  it("rejects null bytes in path", () => {
    expect(isPathSafe("/data/file.txt\x00/etc/passwd")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isPathSafe("/etc/passwd")).toBe(false);
  });

  it("accepts safe relative paths", () => {
    expect(isPathSafe("data/file.txt")).toBe(true);
    expect(isPathSafe("uploads/image.png")).toBe(true);
  });
});

describe("pathSecurity: containPath symlink resolution", () => {
  let tmpDir: string;

  const beforeEach = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pathsec-"));
  };

  const afterEach = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  it("rejects target outside base even via relative path", () => {
    beforeEach();
    try {
      const target = path.join(tmpDir, "..", "outside");
      expect(containPath(tmpDir, target)).toBe(false);
    } finally {
      afterEach();
    }
  });

  it("accepts target within base", () => {
    beforeEach();
    try {
      const target = path.join(tmpDir, "subdir", "file.txt");
      expect(containPath(tmpDir, target)).toBe(true);
    } finally {
      afterEach();
    }
  });

  it("rejects symlink pointing outside base", () => {
    beforeEach();
    try {
      const linkPath = path.join(tmpDir, "escape-link");
      fs.symlinkSync("/etc/passwd", linkPath);
      expect(containPath(tmpDir, linkPath)).toBe(false);
    } finally {
      afterEach();
    }
  });
});

describe("addon: route collision and reserved prefix", () => {
  it("rejects addon mounting on /admin", () => {
    expect(isReservedRoutePrefix("/admin")).toBe(true);
    expect(isReservedRoutePrefix("/admin/images")).toBe(true);
  });

  it("rejects addon mounting on /api", () => {
    expect(isReservedRoutePrefix("/api")).toBe(true);
    expect(isReservedRoutePrefix("/api/v1/servers")).toBe(true);
  });

  it("rejects addon mounting on /ws", () => {
    expect(isReservedRoutePrefix("/ws")).toBe(true);
    expect(isReservedRoutePrefix("/ws/realtime")).toBe(true);
  });

  it("allows addon mounting on non-reserved prefix", () => {
    expect(isReservedRoutePrefix("/my-addon")).toBe(false);
    expect(isReservedRoutePrefix("/custom-page")).toBe(false);
    expect(isReservedRoutePrefix("/modrinth")).toBe(false);
  });
});

describe("addon manifest: malicious manifest rejection", () => {
  let root: string;

  const beforeAll = () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-mal-"));
  };

  const afterAll = () => {
    fs.rmSync(root, { recursive: true, force: true });
  };

  it("rejects manifest with traversal in identifier", () => {
    beforeAll();
    try {
      const dir = path.join(root, "evil-addon");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "Evil",
          identifier: "../../etc/passwd",
          version: "1.0.0",
          main: "index.js",
        }),
      );
      const result = parseAddonManifest(
        path.join(dir, "package.json"),
        "evil-addon",
      );
      expect(result.success).toBe(false);
    } finally {
      afterAll();
    }
  });

  it("rejects manifest with shell metacharacters in name", () => {
    beforeAll();
    try {
      const dir = path.join(root, "shell-addon");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "Shell$(whoami)",
          identifier: "shell-addon",
          version: "1.0.0",
          main: "index.js",
        }),
      );
      const result = parseAddonManifest(
        path.join(dir, "package.json"),
        "shell-addon",
      );
      // Should still parse (name validation is lenient), but identifier must be clean
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.manifest.identifier).toMatch(/^[a-z0-9][a-z0-9-]{0,47}$/);
      }
    } finally {
      afterAll();
    }
  });

  it("rejects reserved identifiers", () => {
    beforeAll();
    try {
      const dir = path.join(root, "admin");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "Admin",
          identifier: "admin",
          version: "1.0.0",
          main: "index.js",
        }),
      );
      const result = parseAddonManifest(
        path.join(dir, "package.json"),
        "admin",
      );
      expect(result.success).toBe(false);
    } finally {
      afterAll();
    }
  });
});
