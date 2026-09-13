import type { AttentionStatus } from "@/types/attention";

// Shared display-formatting helpers. Pulled out in Iteration 4 so
// AttentionSection, WatchlistsDashboard, and WatchlistDetail all render
// prices/percentages/freshness identically instead of each component
// carrying its own slightly-different copy.

export function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Currency symbol for a small set of recognizable symbols from the
// simulated provider's curated table (see
// server/modules/market/providers/simulated.provider.ts) — presentational
// only, so a real Twelve Data quote's own currency isn't second-guessed
// (formatPriceWithCurrency falls back to "$" for anything not in this
// list, matching the simulated provider's own USD default).
const INR_SYMBOLS = new Set([
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "ITC",
  "BHARTIARTL",
  "LT",
  "MARUTI",
]);

export function currencySymbolFor(symbol: string, currency?: string | null): string {
  if (currency === "INR") return "₹";
  if (currency === "USD") return "$";
  return INR_SYMBOLS.has(symbol.toUpperCase()) ? "₹" : "$";
}

export function formatPriceWithCurrency(
  price: number | null,
  symbol: string,
  currency?: string | null,
): string {
  if (price === null) return "—";
  return `${currencySymbolFor(symbol, currency)}${formatPrice(price)}`;
}

export function formatVolume(volume: number | null): string | null {
  if (volume === null) return null;
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return `${volume}`;
}

export function formatPercent(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatFreshness(
  observedAt: string | null,
  status: AttentionStatus,
): string {
  if (status === "UNAVAILABLE") return "No data available";
  if (!observedAt) return "";
  const ms = Date.now() - new Date(observedAt).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  const age =
    minutes < 1
      ? "just now"
      : minutes === 1
        ? "1 min ago"
        : minutes < 60
          ? `${minutes} min ago`
          : `${Math.round(minutes / 60)} hr ago`;
  return status === "STALE" ? `Last known price · ${age}` : `As of ${age}`;
}

// Short freshness label for compact contexts (watchlist item rows),
// where the fuller "Last known price · N min ago" phrasing would wrap
// awkwardly next to a price and a badge.
export function formatFreshnessShort(
  observedAt: string | null,
  status: AttentionStatus,
): string {
  if (status === "UNAVAILABLE") return "No data";
  if (!observedAt) return "";
  const ms = Date.now() - new Date(observedAt).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
}

export const STATUS_LABEL: Record<AttentionStatus, string> = {
  SIGNIFICANT: "Significant move",
  CHANGED: "Changed",
  NEW: "New",
  UNCHANGED: "No change",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
};

export const STATUS_BADGE_CLASS: Record<AttentionStatus, string> = {
  SIGNIFICANT: "badge-significant",
  CHANGED: "badge-changed",
  NEW: "badge-new",
  UNCHANGED: "badge-unchanged",
  STALE: "badge-stale",
  UNAVAILABLE: "badge-unavailable",
};
