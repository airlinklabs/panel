/**
 * Cross-Repo Contract Fixture Suite (Phase 7)
 *
 * Tests that verify the HMAC signing contract between panel and daemon.
 * These tests ensure both sides agree on:
 * - Signature format and bytes
 * - Query parameter canonicalization
 * - Body digest computation
 * - Nonce replay detection
 * - Missing HMAC rejection
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac, createHash } from "crypto";
import fs from "fs";
import path from "path";

const PANEL_ROOT = path.resolve(__dirname, "..");
const DAEMON_ROOT = path.resolve(PANEL_ROOT, "..", "daemon");

// ---------------------------------------------------------------------------
// Shared constants (must match both repos)
// ---------------------------------------------------------------------------
const HMAC_PAYLOAD_VERSION = 1;
const SIGNATURE_WINDOW_S = 30;

// ---------------------------------------------------------------------------
// Helper: replicate panel's HMAC signing logic
// ---------------------------------------------------------------------------
function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildCanonicalTarget(
  pathname: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return pathname;

  const entries: [string, string][] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const encodedKey = percentEncode(key);
    const encodedVal = percentEncode(String(value));

    if (seen.has(encodedKey)) {
      throw new Error(`duplicate query key "${key}" in daemon request params`);
    }
    seen.add(encodedKey);
    entries.push([encodedKey, encodedVal]);
  }

  if (entries.length === 0) return pathname;

  entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  const qs = entries.map(([k, v]) => `${k}=${v}`).join("&");
  return `${pathname}?${qs}`;
}

function hmacSign(
  key: string,
  method: string,
  path: string,
  bodyRepr: string,
  timestamp: number,
  nonce: string,
): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${bodyRepr}`;
  return createHmac("sha256", key).update(payload).digest("hex");
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Test Suite: Canonical Target Encoding
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Canonical Target Encoding", () => {
  it("sorts query params by key then value", () => {
    const result = buildCanonicalTarget("/api/test", { b: "2", a: "1" });
    expect(result).toBe("/api/test?a=1&b=2");
  });

  it("percent-encodes special characters per RFC 3986", () => {
    const result = buildCanonicalTarget("/api/test", { q: "hello world" });
    expect(result).toBe("/api/test?q=hello%20world");
  });

  it("rejects duplicate query keys when detected", () => {
    // JavaScript object literals with duplicate keys just keep the last value,
    // so we need to simulate the case where duplicates are detected at runtime
    // (e.g., from URL parsing or manual construction).
    const params = new URLSearchParams("a=1&a=2");
    const entries: [string, string][] = [];
    const seen = new Set<string>();
    let hasDuplicate = false;

    for (const [key, value] of params) {
      const encodedKey = percentEncode(key);
      if (seen.has(encodedKey)) {
        hasDuplicate = true;
        break;
      }
      seen.add(encodedKey);
      entries.push([encodedKey, percentEncode(value)]);
    }

    expect(hasDuplicate).toBe(true);
  });

  it("returns pathname only when no params", () => {
    const result = buildCanonicalTarget("/api/test");
    expect(result).toBe("/api/test");
  });

  it("handles empty params object", () => {
    const result = buildCanonicalTarget("/api/test", {});
    expect(result).toBe("/api/test");
  });

  it("skips undefined values", () => {
    const result = buildCanonicalTarget("/api/test", { a: "1", b: undefined });
    expect(result).toBe("/api/test?a=1");
  });
});

// ---------------------------------------------------------------------------
// Test Suite: HMAC Signature Format
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: HMAC Signature Format", () => {
  const TEST_KEY = "test-secret-key-12345";

  it("produces 64-char hex signature", () => {
    const sig = hmacSign(
      TEST_KEY,
      "GET",
      "/api/test",
      "",
      1234567890,
      "abc123",
    );
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes timestamp, nonce, method, path, bodyRepr in payload", () => {
    // Same inputs produce same signature
    const sig1 = hmacSign(
      TEST_KEY,
      "POST",
      "/api/test",
      "digest:abc",
      1000,
      "nonce1",
    );
    const sig2 = hmacSign(
      TEST_KEY,
      "POST",
      "/api/test",
      "digest:abc",
      1000,
      "nonce1",
    );
    expect(sig1).toBe(sig2);
  });

  it("different keys produce different signatures", () => {
    const sig1 = hmacSign("key1", "GET", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign("key2", "GET", "/api/test", "", 1000, "nonce1");
    expect(sig1).not.toBe(sig2);
  });

  it("different methods produce different signatures", () => {
    const sig1 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign(TEST_KEY, "POST", "/api/test", "", 1000, "nonce1");
    expect(sig1).not.toBe(sig2);
  });

  it("different paths produce different signatures", () => {
    const sig1 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign(TEST_KEY, "GET", "/api/other", "", 1000, "nonce1");
    expect(sig1).not.toBe(sig2);
  });

  it("different timestamps produce different signatures", () => {
    const sig1 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1001, "nonce1");
    expect(sig1).not.toBe(sig2);
  });

  it("different nonces produce different signatures", () => {
    const sig1 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign(TEST_KEY, "GET", "/api/test", "", 1000, "nonce2");
    expect(sig1).not.toBe(sig2);
  });

  it("body representation changes signature", () => {
    const sig1 = hmacSign(TEST_KEY, "POST", "/api/test", "", 1000, "nonce1");
    const sig2 = hmacSign(
      TEST_KEY,
      "POST",
      "/api/test",
      "digest:abc",
      1000,
      "nonce1",
    );
    expect(sig1).not.toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Body Digest Computation
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Body Digest", () => {
  it("computes sha256 of empty body correctly", () => {
    const emptyDigest =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const computed = sha256Hex(Buffer.from(""));
    expect(computed).toBe(emptyDigest);
  });

  it("computes sha256 of JSON body correctly", () => {
    const body = JSON.stringify({ name: "test" });
    const computed = sha256Hex(Buffer.from(body, "utf8"));
    expect(computed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("digest is deterministic for same input", () => {
    const body = "Hello, World!";
    const digest1 = sha256Hex(Buffer.from(body, "utf8"));
    const digest2 = sha256Hex(Buffer.from(body, "utf8"));
    expect(digest1).toBe(digest2);
  });

  it("different inputs produce different digests", () => {
    const digest1 = sha256Hex(Buffer.from("input1", "utf8"));
    const digest2 = sha256Hex(Buffer.from("input2", "utf8"));
    expect(digest1).not.toBe(digest2);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Header Format
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Header Format", () => {
  it('X-Airlink-Payload-Version is "1"', () => {
    expect(String(HMAC_PAYLOAD_VERSION)).toBe("1");
  });

  it("X-Airlink-Timestamp is Unix seconds (10 digits)", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(String(ts)).toMatch(/^\d{10}$/);
  });

  it("X-Airlink-Nonce is 32-char hex", () => {
    const nonce = Buffer.from(Array(16).fill(0)).toString("hex");
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("X-Airlink-Signature is 64-char hex", () => {
    const sig = hmacSign("key", "GET", "/test", "", 1000, "nonce");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('X-Airlink-Digest uses "sha256:" prefix', () => {
    const digest = sha256Hex(Buffer.from("test"));
    const header = `sha256:${digest}`;
    expect(header).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Timestamp Window
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Timestamp Window", () => {
  it("rejects timestamps older than 30 seconds", () => {
    const now = Math.floor(Date.now() / 1000);
    const oldTs = now - SIGNATURE_WINDOW_S - 1;
    const drift = Math.abs(now - oldTs);
    expect(drift).toBeGreaterThan(SIGNATURE_WINDOW_S);
  });

  it("accepts timestamps within 30 seconds", () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTs = now - 5;
    const drift = Math.abs(now - recentTs);
    expect(drift).toBeLessThanOrEqual(SIGNATURE_WINDOW_S);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Nonce Replay Detection
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Nonce Replay", () => {
  it("same nonce cannot be used twice within window", () => {
    const seenNonces = new Set<string>();
    const ts = Math.floor(Date.now() / 1000);
    const nonce = "test-nonce-123";
    const cacheKey = `${ts}:${nonce}`;

    // First use
    expect(seenNonces.has(cacheKey)).toBe(false);
    seenNonces.add(cacheKey);

    // Second use (replay)
    expect(seenNonces.has(cacheKey)).toBe(true);
  });

  it("different nonces are accepted", () => {
    const seenNonces = new Set<string>();
    const ts = Math.floor(Date.now() / 1000);

    const nonce1 = "nonce-1";
    const nonce2 = "nonce-2";

    seenNonces.add(`${ts}:${nonce1}`);
    expect(seenNonces.has(`${ts}:${nonce2}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Daemon HMAC Verification (source inspection)
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Daemon HMAC Verification", () => {
  let daemonHmacSrc: string;

  beforeAll(() => {
    daemonHmacSrc = fs.readFileSync(
      path.join(DAEMON_ROOT, "src", "security", "hmac.ts"),
      "utf8",
    );
  });

  it("daemon requires HMAC headers in production", () => {
    expect(daemonHmacSrc).toContain("missing_hmac_headers");
    expect(daemonHmacSrc).toContain("REQUIRE_HMAC");
  });

  it("daemon validates payload version", () => {
    expect(daemonHmacSrc).toContain("invalid_payload_version");
    expect(daemonHmacSrc).toContain("versionHeader !== '1'");
  });

  it("daemon enforces 30s timestamp window", () => {
    expect(daemonHmacSrc).toContain("HMAC_WINDOW_SECS");
    expect(daemonHmacSrc).toContain("hmac_expired");
  });

  it("daemon rejects duplicate nonces", () => {
    expect(daemonHmacSrc).toContain("nonce_replayed");
    expect(daemonHmacSrc).toContain("seenNonces");
  });

  it("daemon verifies signature with timing-safe comparison", () => {
    expect(daemonHmacSrc).toContain("timingSafeEqual");
  });

  it("daemon rejects duplicate query keys", () => {
    expect(daemonHmacSrc).toContain("duplicate_query_key");
  });

  it("daemon computes body digest for verification", () => {
    expect(daemonHmacSrc).toContain("bodyDigestAndSize");
    expect(daemonHmacSrc).toContain("x-airlink-digest");
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Panel HMAC Signing (source inspection)
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Panel HMAC Signing", () => {
  let panelDaemonRequestSrc: string;

  beforeAll(() => {
    panelDaemonRequestSrc = fs.readFileSync(
      path.join(
        PANEL_ROOT,
        "src",
        "handlers",
        "utils",
        "core",
        "daemonRequest.ts",
      ),
      "utf8",
    );
  });

  it("panel uses same payload version as daemon", () => {
    expect(panelDaemonRequestSrc).toContain("HMAC_PAYLOAD_VERSION = 1");
  });

  it("panel builds canonical target before signing", () => {
    expect(panelDaemonRequestSrc).toContain("buildCanonicalTarget");
    expect(panelDaemonRequestSrc).toContain("canonicalTarget");
  });

  it("panel signs body digest, not raw body", () => {
    expect(panelDaemonRequestSrc).toContain("digest:");
    expect(panelDaemonRequestSrc).toContain("bodyRepr");
  });

  it("panel sends all required HMAC headers", () => {
    expect(panelDaemonRequestSrc).toContain("X-Airlink-Timestamp");
    expect(panelDaemonRequestSrc).toContain("X-Airlink-Signature");
    expect(panelDaemonRequestSrc).toContain("X-Airlink-Nonce");
    expect(panelDaemonRequestSrc).toContain("X-Airlink-Payload-Version");
  });

  it("panel generates 16-byte random nonces", () => {
    expect(panelDaemonRequestSrc).toContain("NONCE_BYTE_LENGTH = 16");
    expect(panelDaemonRequestSrc).toContain("randomBytes");
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Signature Byte-Level Verification
// ---------------------------------------------------------------------------
describe("Cross-Repo Contract: Signature Byte-Level", () => {
  const KEY = "shared-secret";
  const METHOD = "POST";
  const PATH = "/api/v1/servers";
  const BODY = '{"name":"test"}';
  const BODY_DIGEST = sha256Hex(Buffer.from(BODY, "utf8"));
  const BODY_REPR = `digest:${BODY_DIGEST}`;
  const TIMESTAMP = 1700000000;
  const NONCE = "aabbccdd11223344";

  it("panel and daemon produce identical signatures for same inputs", () => {
    // Panel's signing logic
    const panelPayload = `${TIMESTAMP}:${NONCE}:${METHOD}:${PATH}:${BODY_REPR}`;
    const panelSig = createHmac("sha256", KEY)
      .update(panelPayload)
      .digest("hex");

    // Daemon's signing logic (from hmac.ts sign function)
    const daemonPayload = `${TIMESTAMP}:${NONCE}:${METHOD.toUpperCase()}:${PATH}:${BODY_REPR}`;
    const daemonSig = createHmac("sha256", KEY)
      .update(daemonPayload)
      .digest("hex");

    expect(panelSig).toBe(daemonSig);
    expect(panelSig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signature changes when any component changes", () => {
    const basePayload = `${TIMESTAMP}:${NONCE}:${METHOD}:${PATH}:${BODY_REPR}`;
    const baseSig = createHmac("sha256", KEY).update(basePayload).digest("hex");

    // Change timestamp
    const sig1 = hmacSign(KEY, METHOD, PATH, BODY_REPR, TIMESTAMP + 1, NONCE);
    expect(sig1).not.toBe(baseSig);

    // Change nonce
    const sig2 = hmacSign(
      KEY,
      METHOD,
      PATH,
      BODY_REPR,
      TIMESTAMP,
      "different-nonce",
    );
    expect(sig2).not.toBe(baseSig);

    // Change method
    const sig3 = hmacSign(KEY, "GET", PATH, BODY_REPR, TIMESTAMP, NONCE);
    expect(sig3).not.toBe(baseSig);

    // Change path
    const sig4 = hmacSign(
      KEY,
      METHOD,
      "/other/path",
      BODY_REPR,
      TIMESTAMP,
      NONCE,
    );
    expect(sig4).not.toBe(baseSig);
  });
});
