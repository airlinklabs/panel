import { describe, it, expect } from "vitest";
import {
  inspectImage,
  isSafeUserDirName,
  normalizeUserText,
} from "../src/utils/imageSecurity";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const RIFF_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("inspectImage: magic-byte detection", () => {
  it("detects PNG", () => {
    const r = inspectImage(Buffer.concat([PNG_MAGIC, Buffer.from("idat")]));
    expect(r).toMatchObject({
      ok: true,
      kind: "png",
      mime: "image/png",
      ext: ".png",
    });
  });

  it("detects JPEG", () => {
    const r = inspectImage(
      Buffer.concat([JPEG_MAGIC, Buffer.from([0x00, 0x11, 0x22])]),
    );
    expect(r).toMatchObject({
      ok: true,
      kind: "jpeg",
      mime: "image/jpeg",
      ext: ".jpg",
    });
  });

  it("detects GIF", () => {
    const r = inspectImage(GIF_MAGIC);
    expect(r).toMatchObject({
      ok: true,
      kind: "gif",
      mime: "image/gif",
      ext: ".gif",
    });
  });

  it("detects WebP but not bare RIFF (WAV/AVI)", () => {
    expect(inspectImage(RIFF_WEBP)).toMatchObject({
      ok: true,
      kind: "webp",
      ext: ".webp",
    });
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(inspectImage(wav).ok).toBe(false);
  });

  it("rejects non-images, empty input, and garbage", () => {
    expect(inspectImage(Buffer.from("")).ok).toBe(false);
    expect(inspectImage(Buffer.from("<html><body>x</body></html>")).ok).toBe(
      false,
    );
    expect(inspectImage(Buffer.from("#!/usr/bin/env node\n")).ok).toBe(false);
    expect(inspectImage(Buffer.from([0x00, 0x01, 0x02, 0x03])).ok).toBe(false);
  });
});

describe("inspectImage: polyglot rejection", () => {
  it("rejects a GIF with an embedded HTML document", () => {
    const polyglot = Buffer.concat([
      GIF_MAGIC,
      Buffer.from([0x3b]), // GIF trailer
      Buffer.from(
        '<!DOCTYPE html><script>document.body.innerHTML="pwned"</script>',
      ),
    ]);
    const r = inspectImage(polyglot);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("embedded markup");
  });

  it("rejects a PNG carrying a PHP backdoor", () => {
    const polyglot = Buffer.concat([
      PNG_MAGIC,
      Buffer.from('<?php system($_GET["c"]); ?>'),
    ]);
    expect(inspectImage(polyglot).ok).toBe(false);
  });

  it("rejects files with svg or template markers", () => {
    expect(
      inspectImage(
        Buffer.concat([PNG_MAGIC, Buffer.from("<svg onload=alert(1)>")]),
      ).ok,
    ).toBe(false);
    expect(
      inspectImage(Buffer.concat([PNG_MAGIC, Buffer.from("<% if (evil) { %>")]))
        .ok,
    ).toBe(false);
    expect(
      inspectImage(
        Buffer.concat([GIF_MAGIC, Buffer.from("javascript:alert(1)")]),
      ).ok,
    ).toBe(false);
  });

  it("accepts a plain image that ends with binary data", () => {
    const jpeg = Buffer.concat([
      JPEG_MAGIC,
      Buffer.from(Array.from({ length: 256 }, (_, i) => i % 256)),
    ]);
    expect(inspectImage(jpeg).ok).toBe(true);
  });
});

describe("isSafeUserDirName", () => {
  it("accepts normal usernames and dot-separated names", () => {
    expect(isSafeUserDirName("alice")).toBe(true);
    expect(isSafeUserDirName("Alice_42")).toBe(true);
    expect(isSafeUserDirName("a.b")).toBe(true);
    expect(isSafeUserDirName("a-b_c")).toBe(true);
  });

  it("rejects traversal and reserved names", () => {
    expect(isSafeUserDirName("..")).toBe(false);
    expect(isSafeUserDirName(".")).toBe(false);
    expect(isSafeUserDirName("../etc")).toBe(false);
    expect(isSafeUserDirName("a/b")).toBe(false);
    expect(isSafeUserDirName("a\\b")).toBe(false);
    expect(isSafeUserDirName("")).toBe(false);
    expect(isSafeUserDirName("x".repeat(65))).toBe(false);
  });
});

describe("normalizeUserText", () => {
  it("strips control characters and trims", () => {
    expect(normalizeUserText("  hi\u0000there\n", 100)).toBe("hithere");
    expect(normalizeUserText("a\u0007b\u001fc", 100)).toBe("abc");
  });

  it("caps length", () => {
    expect(normalizeUserText("abcdef", 3)).toBe("abc");
  });

  it("handles non-string input", () => {
    expect(normalizeUserText(null, 100)).toBe("");
    expect(normalizeUserText(42, 100)).toBe("");
    expect(normalizeUserText(undefined, 100)).toBe("");
  });
});
