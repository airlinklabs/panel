import { describe, it, expect } from "vitest";

// The helper is a pure function — importing it must not require a database.
// The module imports prisma at the top level, so stub the db path first.
vi.mock("../src/db", () => ({ default: {} }));

import { resolveWallpaperValue } from "../src/modules/admin/settings";

describe("resolveWallpaperValue", () => {
  it("leaves the wallpaper unchanged when the field is absent", () => {
    expect(resolveWallpaperValue(undefined)).toBeUndefined();
    expect(resolveWallpaperValue(null)).toBeUndefined();
  });

  it("clears the wallpaper on an empty string", () => {
    expect(resolveWallpaperValue("")).toBeNull();
    expect(resolveWallpaperValue("   ")).toBeNull();
  });

  it("accepts http(s) URLs", () => {
    expect(resolveWallpaperValue("https://cdn.example.com/bg.jpg")).toBe(
      "https://cdn.example.com/bg.jpg",
    );
    expect(
      resolveWallpaperValue("  http://localhost:3000/wallpaper.png  "),
    ).toBe("http://localhost:3000/wallpaper.png");
  });

  it("ignores anything that is not an http(s) URL", () => {
    expect(resolveWallpaperValue("/uploads/wallpapers/x.png")).toBeUndefined();
    expect(resolveWallpaperValue("javascript:alert(1)")).toBeUndefined();
    expect(resolveWallpaperValue("data:image/png;base64,AAAA")).toBeUndefined();
    expect(resolveWallpaperValue("ftp://example.com/bg.jpg")).toBeUndefined();
  });
});
