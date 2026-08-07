import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("executes a single task immediately", async () => {
    const limiter = new RateLimiter(10);
    const result = await limiter.schedule(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("spaces out multiple tasks", async () => {
    const limiter = new RateLimiter(50);
    const timestamps: number[] = [];

    const tasks = [0, 1, 2].map((i) =>
      limiter.schedule(() => {
        timestamps.push(Date.now());
        return Promise.resolve(i);
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2]);

    if (timestamps.length >= 2) {
      const gap = timestamps[timestamps.length - 1] - timestamps[0];
      expect(gap).toBeGreaterThanOrEqual(80);
    }
  });

  it("propagates errors", async () => {
    const limiter = new RateLimiter(10);
    await expect(
      limiter.schedule(() => Promise.reject(new Error("fail")))
    ).rejects.toThrow("fail");
  });
});
