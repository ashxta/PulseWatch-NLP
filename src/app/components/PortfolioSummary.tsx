"use client";
import { useMemo } from "react";
import type { AttentionItemDTO } from "@/types/attention";
import { formatPercent, formatFreshness } from "@/lib/format";

export default function PortfolioSummary({ items, totalSymbols }: { items: AttentionItemDTO[]; totalSymbols: number }) {
  const stats = useMemo(() => {
    const available = items.filter((i) => i.currentPrice !== null);
    const gainers = available.filter((i) => (i.absoluteChange ?? 0) > 0).length;
    const decliners = available.filter((i) => (i.absoluteChange ?? 0) < 0).length;
    const unchanged = available.filter((i) => (i.absoluteChange ?? 0) === 0).length;
    const meaningful = items.filter((i) => ["SIGNIFICANT", "CHANGED", "NEW"].includes(i.status)).length;
    const unavailable = items.filter((i) => i.status === "UNAVAILABLE" || i.status === "STALE").length;
    const mover = available.filter((i) => i.percentChange !== null).sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0))[0] ?? null;
    const last = available.map((i) => i.observedAt).filter(Boolean).sort().at(-1) ?? null;
    return { gainers, decliners, unchanged, meaningful, unavailable, mover, last };
  }, [items]);
  const cells = [[totalSymbols, "Stocks tracked"], [stats.meaningful, "Meaningful changes"], [stats.gainers, "Gainers"], [stats.decliners, "Decliners"], [stats.unchanged, "Unchanged"], [stats.unavailable, "Stale / unavailable"]] as const;
  const lastItem = stats.last ? items.find((i) => i.observedAt === stats.last) : null;
  return <section className="market-snapshot-hero"><div className="section-kicker">Market snapshot</div><div className="snapshot-topline"><h2>What moved while you were away.</h2><span className="data-provenance">{items.some((i) => i.status === "STALE") ? "Last known data" : "From your watchlist"}</span></div><div className="snapshot-metrics">{cells.map(([value, label]) => <div className="snapshot-metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="snapshot-footer">{stats.mover ? <span>Biggest mover <b>{stats.mover.symbol}</b> <span className={(stats.mover.absoluteChange ?? 0) >= 0 ? "is-up" : "is-down"}>{formatPercent(stats.mover.percentChange)}</span></span> : <span>Add a stock to calculate movement.</span>}<span>{lastItem ? `Last updated ${formatFreshness(lastItem.observedAt, lastItem.status)}` : "No market observations yet"}</span></div></section>;
}
