"use client";

import { useMemo } from "react";
import type { AttentionItemDTO } from "@/types/attention";
import { formatPercent, formatVolume } from "@/lib/format";

// A compact, secondary summary of the same attention feed
// AttentionSection renders as cards — every figure here is derived from
// `items` at render time, never hardcoded. Deliberately placed after
// "Since your last visit" in the page hierarchy so it reads as
// supporting context, not a competing focal point.
interface MarketSnapshotProps {
  items: AttentionItemDTO[];
  watchlistCount: number;
  totalSymbols: number;
}

export default function MarketSnapshot({
  items,
  watchlistCount,
  totalSymbols,
}: MarketSnapshotProps) {
  const stats = useMemo(() => {
    const tracked = items.filter((i) => i.status !== "UNAVAILABLE");
    const gainers = tracked.filter((i) => (i.absoluteChange ?? 0) > 0).length;
    const decliners = tracked.filter((i) => (i.absoluteChange ?? 0) < 0).length;
    const unchanged = tracked.filter((i) => i.status === "UNCHANGED").length;

    let biggestMover: AttentionItemDTO | null = null;
    let mostActive: AttentionItemDTO | null = null;
    for (const item of tracked) {
      if (
        item.percentChange !== null &&
        (biggestMover === null ||
          Math.abs(item.percentChange) > Math.abs(biggestMover.percentChange ?? 0))
      ) {
        biggestMover = item;
      }
      if (item.volume !== null && (mostActive === null || item.volume > (mostActive.volume ?? 0))) {
        mostActive = item;
      }
    }

    return { gainers, decliners, unchanged, biggestMover, mostActive };
  }, [items]);

  return (
    <div className="snapshot">
      <div className="section-heading-block snapshot-heading-block">
        <h2 className="section-heading">Market snapshot</h2>
        <p className="section-sub">
          {watchlistCount} {watchlistCount === 1 ? "watchlist" : "watchlists"}, at a
          glance.
        </p>
      </div>
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-value">{totalSymbols}</span>
          <span className="metric-label">{totalSymbols === 1 ? "Tracked stock" : "Tracked stocks"}</span>
        </div>
        <div className={`metric-card metric-card-positive ${stats.gainers === 0 ? "is-zero" : ""}`}>
          <span className="metric-value">{stats.gainers}</span>
          <span className="metric-label">{stats.gainers === 1 ? "Gainer" : "Gainers"}</span>
        </div>
        <div className={`metric-card metric-card-negative ${stats.decliners === 0 ? "is-zero" : ""}`}>
          <span className="metric-value">{stats.decliners}</span>
          <span className="metric-label">{stats.decliners === 1 ? "Decliner" : "Decliners"}</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">{stats.unchanged}</span>
          <span className="metric-label">Unchanged</span>
        </div>
      </div>

      {(stats.biggestMover || stats.mostActive) && (
        <div className="snapshot-highlights">
          {stats.biggestMover && (
            <div className="snapshot-highlight">
              <span className="snapshot-highlight-label">Biggest mover</span>
              <span className="snapshot-highlight-value">
                {stats.biggestMover.symbol}
                <span
                  className={`snapshot-highlight-delta ${
                    (stats.biggestMover.absoluteChange ?? 0) >= 0 ? "is-up" : "is-down"
                  }`}
                >
                  {formatPercent(stats.biggestMover.percentChange)}
                </span>
              </span>
            </div>
          )}
          {stats.mostActive && (
            <div className="snapshot-highlight">
              <span className="snapshot-highlight-label">Most active</span>
              <span className="snapshot-highlight-value">
                {stats.mostActive.symbol}
                <span className="snapshot-highlight-sub">
                  Vol {formatVolume(stats.mostActive.volume)}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
