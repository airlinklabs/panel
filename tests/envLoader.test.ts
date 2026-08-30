import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/handlers/envLoader";

describe("parseEnv", () => {
  it("parses simple KEY=VALUE pairs", () => {
    expect(parseEnv("FOO=bar")).toEqual({ FOO: "bar" });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseEnv("  FOO  =  bar  ")).toEqual({ FOO: "bar" });
  });

  it("strips surrounding single quotes from values", () => {
    expect(parseEnv("FOO='bar'")).toEqual({ FOO: "bar" });
  });

  it("strips surrounding double quotes from values", () => {
    expect(parseEnv('FOO="bar"')).toEqual({ FOO: "bar" });
  });

  it("preserves quotes inside values", () => {
    expect(parseEnv('FOO="b\'ar"')).toEqual({ FOO: "b'ar" });
  });

  it("skips comment lines starting with #", () => {
    expect(parseEnv("# FOO=bar\nBAZ=qux")).toEqual({ BAZ: "qux" });
  });

  it("skips blank lines", () => {
    expect(parseEnv("FOO=bar\n\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles values containing =", () => {
    expect(parseEnv("FOO=base64==")).toEqual({ FOO: "base64==" });
  });

  it("skips lines without =", () => {
    expect(parseEnv("NOEQUALSIGN")).toEqual({});
  });

  it("handles empty content", () => {
    expect(parseEnv("")).toEqual({});
  });

  it("handles multiple assignments", () => {
    const input = 'A=1\nB=two\nC="three"';
    expect(parseEnv(input)).toEqual({ A: "1", B: "two", C: "three" });
  });
});
