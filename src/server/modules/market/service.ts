import { getEnv } from "@/server/lib/env";
import { getMarketDataProvider } from "./provider-factory";
import { getMarketDataRateLimiter } from "./rate-limiter";
import {
  recordObservation,
  getLatestObservation,
  getRecentObservations,
  backfillInstrumentMetadata,
} from "./repository";
import type { HistoricalBar, HistoryRange, QuoteOutcome } from "./types";

export interface InstrumentRef {
  id: string;
  symbol: string;
}

// The single entry point the rest of the app (the attention module) uses
// to get a price for an instrument. Folds together: rate limiting,
// request timeout, provider failure handling, PriceObservation
// persistence, and stale/unavailable fallback — callers only ever see a
// `QuoteOutcome`, never a raw provider exception.
//
// PROJECT_SPEC.md's reliability requirement: a provider failure must
// never corrupt stored data or crash the app, and the last known good
// data should still be servable, marked as stale. This function is where
// that requirement is actually implemented.
export async function getQuoteForInstrument(
  instrument: InstrumentRef,
): Promise<QuoteOutcome> {
  const env = getEnv();
  const limiter = getMarketDataRateLimiter(
    env.MARKET_DATA_RATE_LIMIT_PER_MINUTE,
  );

  if (!limiter.tryAcquire()) {
    return fallbackOrUnavailable(
      instrument.id,
      "Market data rate limit reached for this minute",
    );
  }

  const provider = getMarketDataProvider();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    env.MARKET_DATA_TIMEOUT_MS,
  );

  try {
    const quote = await provider.fetchQuote(instrument.symbol, controller.signal);

    // Persistence and metadata backfill happen best-effort, after the
    // successful read: if either write fails (e.g. a transient DB
    // hiccup), the user should still get the fresh price they were
    // waiting on rather than the whole request failing — an unpersisted
    // observation just means the next successful read won't have this
    // one specific point in its history, which is a much smaller problem
    // than serving no price at all.
    try {
      await recordObservation(instrument.id, quote, provider.name);
      await backfillInstrumentMetadata(instrument.id, {
        name: quote.name,
        exchange: quote.exchange,
      });
    } catch {
      // Deliberately swallowed — see comment above. Persistence failure
      // must not turn a successful market-data read into a user-facing
      // error.
    }

    return {
      status: "fresh",
      price: quote.price,
      observedAt: quote.observedAt,
      currency: quote.currency,
      volume: quote.volume,
      avgVolume: quote.avgVolume,
    };
  } catch (err) {
    const reason = describeError(err, env.MARKET_DATA_TIMEOUT_MS);
    return fallbackOrUnavailable(instrument.id, reason);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Real, persisted price history for an instrument — the source for the
// UI's sparklines. Ascending order (oldest first). Never fabricated: this
// is exactly what `market/repository.ts` recorded from past
// `getQuoteForInstrument` calls (simulated or real), including the
// observation just recorded by this same request if any.
export async function getRecentPriceHistory(
  instrumentId: string,
  limit = 20,
): Promise<number[]> {
  try {
    const rows = await getRecentObservations(instrumentId, limit);
    return rows.map((row) => Number(row.price));
  } catch {
    // Same "never fail the whole response over a secondary read" rule as
    // the rest of this module — a sparkline is presentational, not a
    // required field.
    return [];
  }
}

export async function getHistoricalBars(instrument: InstrumentRef, range: HistoryRange): Promise<{ bars: HistoricalBar[]; source: string; status: "fresh" | "unavailable" }> {
  const env = getEnv();
  const provider = getMarketDataProvider();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), env.MARKET_DATA_TIMEOUT_MS);
  try {
    const bars = await provider.fetchHistory(instrument.symbol, range, controller.signal);
    return { bars, source: provider.name, status: "fresh" };
  } catch {
    return { bars: [], source: provider.name, status: "unavailable" };
  } finally { clearTimeout(timeoutHandle); }
}

function describeError(err: unknown, timeoutMs: number): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return `Market data request timed out after ${timeoutMs}ms`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Unknown market data provider error";
}

async function fallbackOrUnavailable(
  instrumentId: string,
  reason: string,
): Promise<QuoteOutcome> {
  let last: Awaited<ReturnType<typeof getLatestObservation>>;
  try {
    last = await getLatestObservation(instrumentId);
  } catch {
    // The database itself is unreachable — this instrument has no
    // servable price at all right now, but that must not throw and take
    // the rest of the /api/attention response down with it (see
    // attention/service.ts, which also wraps each instrument
    // independently as a second layer of the same guarantee).
    return { status: "unavailable", reason };
  }

  if (!last) {
    return { status: "unavailable", reason };
  }

  return {
    status: "stale",
    price: Number(last.price),
    observedAt: last.observedAt,
    reason,
  };
}
