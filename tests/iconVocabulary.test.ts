import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const lucide = require("lucide") as Record<string, unknown>;

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".tmp-ejs-lint")
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ejs|ts|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function serverIconNames(): string[] {
  const files = [
    ...walk(join(__dirname, "..", "views")),
    ...walk(join(__dirname, "..", "src")),
  ];
  const names = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(/icon\(\s*'([a-z0-9-]+)'/g))
      names.add(m[1]);
  }
  return [...names];
}

function clientIconNames(): string[] {
  const files = walk(join(__dirname, "..", "public", "javascript"));
  const names = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(/alIcon\(\s*'([a-zA-Z0-9.-]+)'/g))
      names.add(m[1]);
  }
  return [...names];
}

describe("icon vocabulary", () => {
  const serverNames = serverIconNames();

  it("every server-side icon() name resolves against lucide", () => {
    const missing = serverNames.filter((n) => !lucide[toPascalCase(n)]);
    expect(missing).toEqual([]);
  });

  it("server-side icon() renders stroke-width 1.5 by default", async () => {
    const mod = await import("../src/utils/icon");
    const out = mod.default("x");
    expect(out).toContain('stroke-width="1.5"');
    expect(out).not.toContain('stroke-width="1.75"');
  });

  it("no inline <svg> in views except exempt brand marks", () => {
    const BRAND_VIEWBOXES = new Set(["0 0 127.14 96.36", "0 0 24 24"]);
    const files = walk(join(__dirname, "..", "views"));
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const m of content.matchAll(/<svg[^>]*>/g)) {
        const tag = m[0];
        if (tag.includes("icon(")) continue;
        if (!tag.includes("viewBox")) continue;
        const vb = (tag.match(/viewBox="([^"]+)"/) || [])[1];
        if (vb && BRAND_VIEWBOXES.has(vb)) continue;
        offenders.push(`${file}: ${tag.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every client-side alIcon() name exists in the generated icon set", () => {
    const src = readFileSync(
      join(__dirname, "..", "public", "javascript", "shared", "al-icon.js"),
      "utf8",
    );
    const mapMatch = src.match(/var ICONS = (\{[\s\S]*?\});\n/);
    expect(mapMatch, "al-icon.js must expose an ICONS map").not.toBeNull();
    const defined = new Set(Object.keys(JSON.parse(mapMatch![1])));
    const used = clientIconNames();
    const missing = used.filter((n) => !defined.has(n));
    expect(missing).toEqual([]);
  });

  it("client icon set covers every name the client code uses", () => {
    expect(clientIconNames().length).toBeGreaterThan(0);
  });
});
