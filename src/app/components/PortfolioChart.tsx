"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { getDemoPortfolioSeries, type ChartRange } from "@/lib/demo-portfolio";
import { formatPrice } from "@/lib/format";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "1Y"];
const WIDTH = 720;
const HEIGHT = 220;
const PAD_X = 8;
const PAD_Y = 16;

export default function PortfolioChart() {
  const prefersReducedMotion = useReducedMotion();
  const [range, setRange] = useState<ChartRange>("1D");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const series = useMemo(() => getDemoPortfolioSeries(range), [range]);

  const { path, areaPath, points, min, max } = useMemo(() => {
    const values = series.map((p) => p.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;
    const points = series.map((p, i) => {
      const x = PAD_X + (i / (series.length - 1)) * (WIDTH - PAD_X * 2);
      const y = HEIGHT - PAD_Y - ((p.v - min) / spread) * (HEIGHT - PAD_Y * 2);
      return { x, y, value: p.v, t: p.t };
    });
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    const areaPath =
      lastPoint && firstPoint
        ? `${path} L${lastPoint.x.toFixed(2)},${HEIGHT} L${firstPoint.x.toFixed(2)},${HEIGHT} Z`
        : "";
    return { path, areaPath, points, min, max };
  }, [series]);

  const first = series[0]?.v ?? 0;
  const last = series[series.length - 1]?.v ?? 0;
  const isUp = last >= first;
  const changePct = first > 0 ? (((last - first) / first) * 100).toFixed(2) : "0.00";
  const toneClass = isUp ? "is-up" : "is-down";

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(relX * (points.length - 1))));
    setHoverIndex(idx);
  }

  return (
    <section className="portfolio-chart-panel liquid-glass">
      <div className="portfolio-chart-header">
        <div>
          <p className="attention-eyebrow">Portfolio performance</p>
          <div className="portfolio-chart-value-row">
            <span className="portfolio-chart-value">
              ₹{formatPrice(hovered ? hovered.value : last)}
            </span>
            <span className={`portfolio-chart-change ${toneClass}`}>
              {isUp ? "+" : ""}
              {changePct}% · {range}
            </span>
          </div>
        </div>
        <div className="range-tabs" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              className={`range-tab ${range === r ? "is-active" : ""}`}
              onClick={() => {
                setRange(r);
                setHoverIndex(null);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="portfolio-chart-stage">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          preserveAspectRatio="none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`Portfolio value over ${range}: ${isUp ? "up" : "down"} ${changePct}%`}
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? "var(--color-positive)" : "var(--color-negative)"} stopOpacity="0.22" />
              <stop offset="100%" stopColor={isUp ? "var(--color-positive)" : "var(--color-negative)"} stopOpacity="0" />
            </linearGradient>
          </defs>

          <AnimatePresence mode="wait">
            <motion.g key={range}>
              <motion.path
                d={areaPath}
                fill="url(#chart-fill)"
                stroke="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <motion.path
                d={path}
                fill="none"
                stroke={isUp ? "var(--color-positive)" : "var(--color-negative)"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.g>
          </AnimatePresence>

          {hovered && (
            <>
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={PAD_Y}
                y2={HEIGHT - PAD_Y}
                className="portfolio-chart-hover-line"
              />
              <circle cx={hovered.x} cy={hovered.y} r={4} className={`portfolio-chart-hover-dot ${toneClass}`} />
            </>
          )}
        </svg>
      </div>

      <div className="portfolio-chart-footer">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </section>
  );
}
