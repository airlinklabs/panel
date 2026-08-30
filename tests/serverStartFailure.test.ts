import { describe, expect, it } from "vitest";
import { classifyDaemonStartFailure } from "../src/modules/user/server/shared";

describe("daemon start failure classification", () => {
  it("reports a host-port conflict without retrying it", () => {
    const failure = classifyDaemonStartFailure(
      "server error - Bind for 0.0.0.0:25565 failed: port is already allocated",
    );

    expect(failure.code).toBe("DAEMON_PORT_CONFLICT");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("port 25565 is already in use");
  });

  it("keeps unknown daemon start errors retryable", () => {
    const failure = classifyDaemonStartFailure(
      "server error - temporary daemon failure",
    );

    expect(failure.code).toBe("DAEMON_START_FAILED");
    expect(failure.retryable).toBe(true);
  });
});
