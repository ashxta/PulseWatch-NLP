// A minimal in-memory sliding-window rate limiter, scoped to a single
// Node process. This is a deliberate simplification (see DECISIONS.md):
// PulseWatch is a modular monolith with no shared cache/queue layer
// (PROJECT_SPEC.md's "no premature infrastructure" principle), and a
// single process is genuinely all this 72-hour-scoped app runs as. The
// known limitation is that this limit is per-instance, not global — if
// PulseWatch were ever horizontally scaled to multiple instances, each
// would enforce the limit independently and the effective combined rate
// against the provider could exceed the configured value. That's an
// explicit, documented trade-off, not an oversight.

export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  // Returns true and records a slot if under the limit; returns false
  // (and records nothing) if the limit has been reached for the current
  // window. Non-blocking by design — callers decide what to do when
  // denied (the market module falls back to cached/unavailable) rather
  // than this class queuing or sleeping.
  tryAcquire(): boolean {
    this.evictExpired();
    if (this.timestamps.length >= this.limit) {
      return false;
    }
    this.timestamps.push(Date.now());
    return true;
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
  }
}

let cachedLimiter: SlidingWindowRateLimiter | undefined;

// Lazily constructed and cached at module scope (same pattern as
// `src/server/db/prisma.ts`) so every call within the process shares one
// limiter instance and therefore one shared budget, rather than each
// import creating its own independent (and ineffective) limiter.
export function getMarketDataRateLimiter(
  limitPerMinute: number,
): SlidingWindowRateLimiter {
  if (!cachedLimiter) {
    cachedLimiter = new SlidingWindowRateLimiter(limitPerMinute, 60_000);
  }
  return cachedLimiter;
}
