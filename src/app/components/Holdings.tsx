"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DEMO_LIVE_BUCKET_MS, getDemoHoldings, getDemoPortfolioSummary } from "@/lib/demo-portfolio";
import { formatPrice } from "@/lib/format";

// Ticks the demo holdings/P&L forward every `DEMO_LIVE_BUCKET_MS` so the
// gross/net P&L window below reads as live rather than frozen at mount.
// `getDemoHoldings`/`getDemoPortfolioSummary` are pure functions of this
// bucket number — same deterministic-per-bucket design as the rest of
// this module (see demo-portfolio.ts) — so re-running this timer never
// introduces randomness, just moves which bucket is "current."
function useLiveBucket(): number {
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / DEMO_LIVE_BUCKET_MS));

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setBucket(Math.floor(Date.now() / DEMO_LIVE_BUCKET_MS));
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  return bucket;
}

export default function Holdings() {
  const prefersReducedMotion = useReducedMotion();
  const liveBucket = useLiveBucket();
  const holdings = useMemo(() => getDemoHoldings(liveBucket), [liveBucket]);
  const summary = useMemo(() => getDemoPortfolioSummary(holdings), [holdings]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return holdings;
    return holdings.filter((h) => h.symbol.includes(q) || h.name.toUpperCase().includes(q));
  }, [holdings, query]);

  const grossUp = summary.totalPnl >= 0;
  const netUp = summary.netPnl >= 0;
  const todayUp = summary.todayPnl >= 0;

  return (
    <section className="holdings-panel">
      <div className="section-heading-block holdings-heading-block">
        <div>
          <h2 className="section-heading">Holdings</h2>
          <p className="section-sub">Synthetic demo positions — not real holdings.</p>
        </div>
        <input
          className="input holdings-search"
          placeholder="Search holdings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search holdings"
        />
      </div>

      <div className="portfolio-chart-header">
        <div>
          <p className="attention-eyebrow">
            Portfolio P&amp;L <span className="freshness-dot is-live" aria-hidden="true" /> Live · demo data
          </p>
          <div className="portfolio-chart-value-row">
            <span className="portfolio-chart-value">₹{formatPrice(summary.currentValue)}</span>
            <span className={`portfolio-chart-change ${todayUp ? "is-up" : "is-down"}`}>
              {todayUp ? "+" : ""}₹{formatPrice(Math.abs(summary.todayPnl))} ({todayUp ? "+" : ""}
              {summary.todayPnlPercent.toFixed(2)}%) today
            </span>
          </div>
        </div>
      </div>

      <div className="portfolio-stats-grid holdings-pnl-grid">
        <div className="portfolio-stat-card">
          <p className="portfolio-stat-label">Invested</p>
          <p className="portfolio-stat-value">₹{formatPrice(summary.investedValue)}</p>
        </div>
        <div className="portfolio-stat-card">
          <p className="portfolio-stat-label">Current value</p>
          <p className="portfolio-stat-value">₹{formatPrice(summary.currentValue)}</p>
        </div>
        <div className="portfolio-stat-card">
          <p className="portfolio-stat-label">Gross P&amp;L</p>
          <p className={`portfolio-stat-value ${grossUp ? "is-up" : "is-down"}`}>
            {grossUp ? "+" : ""}₹{formatPrice(Math.abs(summary.totalPnl))}
          </p>
          <p className={`portfolio-stat-sub ${grossUp ? "is-up" : "is-down"}`}>
            {grossUp ? "+" : ""}
            {summary.totalPnlPercent.toFixed(2)}%
          </p>
        </div>
        <div className="portfolio-stat-card portfolio-stat-card-muted">
          <p className="portfolio-stat-label">Est. charges</p>
          <p className="portfolio-stat-value">−₹{formatPrice(summary.estimatedCharges)}</p>
          <p className="portfolio-stat-sub">Brokerage, STT, fees</p>
        </div>
        <div className="portfolio-stat-card">
          <p className="portfolio-stat-label">Net P&amp;L</p>
          <p className={`portfolio-stat-value ${netUp ? "is-up" : "is-down"}`}>
            {netUp ? "+" : ""}₹{formatPrice(Math.abs(summary.netPnl))}
          </p>
          <p className={`portfolio-stat-sub ${netUp ? "is-up" : "is-down"}`}>
            {netUp ? "+" : ""}
            {summary.netPnlPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="holdings-table-scroll">
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Stock</th>
              <th className="num">Qty</th>
              <th className="num">Avg. price</th>
              <th className="num">LTP</th>
              <th className="num">Invested</th>
              <th className="num">Current value</th>
              <th className="num">Today&apos;s P&amp;L</th>
              <th className="num">Total P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => {
              const todayUp = h.todayPnl >= 0;
              const totalUp = h.pnl >= 0;
              return (
                <motion.tr
                  key={h.symbol}
                  className="holdings-row"
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: prefersReducedMotion ? 0 : i * 0.03 }}
                  whileHover={prefersReducedMotion ? undefined : { backgroundColor: "var(--color-surface-hover)" }}
                >
                  <td>
                    <div className="holdings-symbol-cell">
                      <span className="holdings-symbol">{h.symbol}</span>
                      <span className="holdings-name">{h.name}</span>
                    </div>
                  </td>
                  <td className="num">{h.quantity}</td>
                  <td className="num">₹{formatPrice(h.avgBuyPrice)}</td>
                  <td className="num">₹{formatPrice(h.currentPrice)}</td>
                  <td className="num">₹{formatPrice(h.investedValue)}</td>
                  <td className="num">₹{formatPrice(h.currentValue)}</td>
                  <td className={`num ${todayUp ? "is-up" : "is-down"}`}>
                    {todayUp ? "+" : ""}₹{formatPrice(Math.abs(h.todayPnl))}
                    <span className="holdings-pct">
                      ({todayUp ? "+" : ""}
                      {h.todayPnlPercent.toFixed(2)}%)
                    </span>
                  </td>
                  <td className={`num ${totalUp ? "is-up" : "is-down"}`}>
                    {totalUp ? "+" : ""}₹{formatPrice(Math.abs(h.pnl))}
                    <span className="holdings-pct">
                      ({totalUp ? "+" : ""}
                      {h.pnlPercent.toFixed(2)}%)
                    </span>
                  </td>
                </motion.tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="holdings-empty">
                  No holdings match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
