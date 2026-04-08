const DEFAULT_RATE_LIMIT = 6; // Lokalise: 6 requests/second
const DEFAULT_WINDOW_MS = 1000;

export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;
  private readonly windowMs: number;

  constructor(maxConcurrent = DEFAULT_RATE_LIMIT, windowMs = DEFAULT_WINDOW_MS) {
    this.maxConcurrent = maxConcurrent;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve();
      });
    });
  }

  release(): void {
    setTimeout(() => {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }, this.windowMs);
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
