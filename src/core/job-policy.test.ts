import { describe, it, expect } from "vitest";
import { shouldBlockNewTrack } from "./job-policy";

describe("job-policy", () => {
  it("blocks new track for public_api when active job paused", () => {
    expect(
      shouldBlockNewTrack("public_api", [
        { isActive: true, isRunning: false, traceStatus: "paused" },
      ])
    ).toBe(true);
  });

  it("allows new track for btc_node when paused", () => {
    expect(
      shouldBlockNewTrack("btc_node", [
        { isActive: true, isRunning: false, traceStatus: "paused" },
      ])
    ).toBe(false);
  });

  it("allows new track for public_api when idle", () => {
    expect(
      shouldBlockNewTrack("public_api", [
        { isActive: true, isRunning: false, traceStatus: "idle" },
      ])
    ).toBe(false);
  });
});
