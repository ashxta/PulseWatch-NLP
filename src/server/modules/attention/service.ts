import { prisma } from "@/server/db/prisma";
import { getQuoteForInstrument, getRecentPriceHistory } from "@/server/modules/market";
import type { QuoteOutcome } from "@/server/modules/market";
import { getAttentionThresholds } from "./config";
import { getLastSeenState, upsertLastSeenState } from "./lastSeenRepository";
import { computeAttention, type AttentionComputation } from "./engine";
import type { AttentionItemDTO, AttentionStatus } from "@/types/attention";

interface WatchlistItemContext {
  itemId: string;
  watchlistId: string;
  watchlistName: string;
  instrumentId: string;
  symbol: string;
  name: string;
  exchange: string;
}

// Loads the calling user's own watchlist items (optionally scoped to one
// watchlist). Scoping the Prisma `where` to `userId` is what provides
// ownership enforcement here — the same pattern as
// `requireOwnedWatchlist` in the watchlist module (DECISIONS.md #8): a
// `watchlistId` that doesn't exist, or belongs to another user, simply
// matches zero rows and yields an empty attention list rather than an
// error, so existence is never leaked through this endpoint either.
async function loadOwnedWatchlistItems(
  userId: string,
  watchlistId?: string,
): Promise<WatchlistItemContext[]> {
  const watchlists = await prisma.watchlist.findMany({
    where: { userId, ...(watchlistId ? { id: watchlistId } : {}) },
    include: {
      items: {
        orderBy: { addedAt: "asc" },
        include: { instrument: true },
      },
    },
  });

  return watchlists.flatMap((watchlist) =>
    watchlist.items.map((item) => ({
      itemId: item.id,
      watchlistId: watchlist.id,
      watchlistName: watchlist.name,
      instrumentId: item.instrument.id,
      symbol: item.instrument.symbol,
      name: item.instrument.name,
      exchange: item.instrument.exchange,
    })),
  );
}

// Sort weight: lower sorts first. Meaningful changes rise to the top per
// PROJECT_SPEC.md; UNAVAILABLE sinks to the bottom since there's nothing
// actionable to show.
const STATUS_SORT_WEIGHT: Record<AttentionStatus, number> = {
  SIGNIFICANT: 0,
  CHANGED: 1,
  NEW: 2,
  STALE: 3,
  UNCHANGED: 4,
  UNAVAILABLE: 5,
};

function toEngineQuote(outcome: QuoteOutcome) {
  if (outcome.status === "unavailable") {
    return { status: "unavailable" as const, reason: outcome.reason };
  }
  if (outcome.status === "stale") {
    return {
      status: "stale" as const,
      price: outcome.price,
      observedAt: outcome.observedAt,
      reason: outcome.reason,
    };
  }
  return {
    status: "fresh" as const,
    price: outcome.price,
    observedAt: outcome.observedAt,
  };
}

function toDTO(
  ctx: WatchlistItemContext,
  computation: AttentionComputation,
  extra?: {
    sparkline?: number[];
    volume?: number | null;
    avgVolume?: number | null;
    currency?: string | null;
  },
): AttentionItemDTO {
  return {
    itemId: ctx.itemId,
    watchlistId: ctx.watchlistId,
    watchlistName: ctx.watchlistName,
    symbol: ctx.symbol,
    name: ctx.name,
    exchange: ctx.exchange,
    status: computation.status,
    previousPrice: computation.previousPrice,
    currentPrice: computation.currentPrice,
    absoluteChange: computation.absoluteChange,
    percentChange: computation.percentChange,
    attentionScore: computation.attentionScore,
    reason: computation.reason,
    observedAt: computation.observedAt ? computation.observedAt.toISOString() : null,
    currency: extra?.currency ?? null,
    sparkline: extra?.sparkline ?? [],
    volume: extra?.volume ?? null,
    avgVolume: extra?.avgVolume ?? null,
  };
}

async function evaluateOne(
  userId: string,
  ctx: WatchlistItemContext,
  thresholds: ReturnType<typeof getAttentionThresholds>,
): Promise<AttentionItemDTO> {
  try {
    // Read the previous baseline BEFORE fetching the current quote or
    // touching LastSeenState — the comparison must always be against
    // what the user actually last saw, never against a value this same
    // call is about to write.
    const previous = await getLastSeenState(userId, ctx.instrumentId);
    const outcome = await getQuoteForInstrument({
      id: ctx.instrumentId,
      symbol: ctx.symbol,
    });
    const computation = computeAttention(previous, toEngineQuote(outcome), thresholds);

    // Only establish/advance the baseline once we have an actual price
    // to remember (fresh or stale-with-a-cached-price). An UNAVAILABLE
    // read leaves the existing baseline untouched, so the next
    // successful read still compares against the last price the user
    // genuinely saw rather than silently resetting to "no history".
    if (computation.currentPrice !== null && computation.observedAt) {
      await upsertLastSeenState(
        userId,
        ctx.instrumentId,
        computation.currentPrice,
        computation.observedAt,
      );
    }

    // Sparkline/volume are presentational-only additions layered on top
    // of the classification above — never inputs to it, so the pure
    // engine and its tests stay untouched. Volume only exists on a
    // "fresh" outcome (see market/types.ts); a stale/unavailable read
    // has no volume figure to show, not a fabricated one.
    const sparkline = await getRecentPriceHistory(ctx.instrumentId, 20);
    const volume = outcome.status === "fresh" ? (outcome.volume ?? null) : null;
    const avgVolume = outcome.status === "fresh" ? (outcome.avgVolume ?? null) : null;
    const currency = outcome.status === "fresh" ? (outcome.currency ?? null) : null;

    return toDTO(ctx, computation, { sparkline, volume, avgVolume, currency });
  } catch (err) {
    // A single instrument's unexpected failure (beyond what the market
    // module already turns into "stale"/"unavailable") must not take
    // down the whole /api/attention response — every other instrument
    // still gets evaluated and returned.
    return toDTO(ctx, {
      status: "UNAVAILABLE",
      previousPrice: null,
      currentPrice: null,
      absoluteChange: null,
      percentChange: null,
      attentionScore: 0,
      reason:
        err instanceof Error
          ? `Failed to evaluate this instrument: ${err.message}`
          : "Failed to evaluate this instrument.",
      observedAt: null,
    }, { currency: null });
  }
}

// Returns attention state for every instrument across the user's own
// watchlists (or just one, when `watchlistId` is given), sorted so
// meaningful changes rise to the top. Handles multiple instruments and
// partial provider failures per-item — see `evaluateOne`.
export async function getAttentionForUser(
  userId: string,
  watchlistId?: string,
): Promise<AttentionItemDTO[]> {
  const contextItems = await loadOwnedWatchlistItems(userId, watchlistId);
  const thresholds = getAttentionThresholds();

  const results = await Promise.all(
    contextItems.map((ctx) => evaluateOne(userId, ctx, thresholds)),
  );

  return results.sort((a, b) => {
    const weightDiff = STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
    if (weightDiff !== 0) return weightDiff;
    return b.attentionScore - a.attentionScore;
  });
}
