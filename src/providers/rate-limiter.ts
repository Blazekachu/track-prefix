export class RateLimiter {
  private delayMs: number;
  private queue: Array<{ fn: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private running = false;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject });
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift()!;
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      }
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
    }

    this.running = false;
  }
}
