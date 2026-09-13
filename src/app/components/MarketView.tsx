"use client";
import { useEffect, useState } from "react";
import type { AttentionItemDTO } from "@/types/attention";
import type { HistoricalBar, HistoryRange } from "@/server/modules/market/types";
import { fetchMarketHistory } from "@/lib/api-client";
import { toHeikinAshi, toRenko } from "@/server/modules/market/chart-transformations";
import { formatPrice, formatPriceWithCurrency, formatPercent, formatFreshness } from "@/lib/format";
import Link from "next/link";

type ChartType = "line" | "area" | "bar" | "candles" | "heikin" | "renko" | "map";
const chartTypes: Array<[ChartType, string]> = [["line", "Line"], ["area", "Area"], ["bar", "Bars"], ["candles", "Candles"], ["heikin", "Heikin-Ashi"], ["renko", "Renko"], ["map", "Market map"]];
const ranges: HistoryRange[] = ["1D", "1W", "1M", "3M", "1Y"];

export default function MarketView({ items }: { items: AttentionItemDTO[] }) {
  const available = items.filter((i) => i.currentPrice !== null);
  const [selected, setSelected] = useState(available[0]?.symbol ?? "");
  const [type, setType] = useState<ChartType>("area");
  const [range, setRange] = useState<HistoryRange>("1M");
  const [bars, setBars] = useState<HistoricalBar[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const current = items.find((i) => i.symbol === selected);
  useEffect(() => { if (!selected || type === "map") return; let cancelled = false; setLoading(true); fetchMarketHistory(selected, range).then((r) => { if (!cancelled) { setBars(r.bars); setSource(r.source); } }).catch(() => { if (!cancelled) setBars([]); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [selected, range, type]);
  const derived = type === "heikin" ? toHeikinAshi(bars) : type === "renko" ? toRenko(bars).bars : bars;
  return <section className="market-view"><div className="market-view-header"><div><div className="section-kicker">Market view</div><h2>Explore your market</h2></div>{source && <span className="data-provenance">{source === "simulated" ? "DEMO DATA" : "PROVIDER DATA"}</span>}</div><div className="market-controls"><select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Stock"><option value="">Select a stock</option>{available.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select><div className="control-scroll">{chartTypes.map(([value, label]) => <button key={value} className={type === value ? "control active" : "control"} onClick={() => setType(value)}>{label}</button>)}</div><div className="range-controls">{ranges.map((r) => <button key={r} className={range === r ? "control active" : "control"} onClick={() => setRange(r)}>{r}</button>)}</div></div>{type === "map" ? <MarketMap items={items} /> : current && <div className="chart-workspace"><div className="chart-stat"><span>{current.symbol}</span><strong>{formatPriceWithCurrency(current.currentPrice, current.symbol, current.currency)}</strong><b className={(current.absoluteChange ?? 0) >= 0 ? "is-up" : "is-down"}>{formatPercent(current.percentChange)}</b><small>{current.status === "STALE" ? "STALE · " : ""}{current.observedAt ? formatFreshness(current.observedAt, current.status) : "Unavailable"}</small></div>{loading ? <div className="chart-empty">Loading market history…</div> : <SvgChart bars={derived} type={type} />}{type === "renko" && <small className="chart-note">Renko · derived view · brick size {formatPrice(Math.max((bars[0]?.close ?? 1) * 0.01, 0.01))}</small>}</div>}{!available.length && <div className="empty-state">Add your first stock to open Market View.</div>}</section>;
}

function SvgChart({ bars, type }: { bars: HistoricalBar[]; type: ChartType }) { const values = bars.flatMap((b) => [b.high, b.low]); const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1; const pointList = bars.map((b, i) => `${(i / Math.max(1, bars.length - 1)) * 100},${100 - ((b.close - min) / spread) * 88 - 6}`).join(" "); if (!bars.length) return <div className="chart-empty">Market data unavailable.</div>; return <svg className="market-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${type} chart`}>{type === "bar" ? bars.map((b, i) => <line key={i} x1={(i / bars.length) * 100} x2={(i / bars.length) * 100} y1={100 - ((b.high - min) / spread) * 88 - 6} y2={100 - ((b.low - min) / spread) * 88 - 6} stroke={b.close >= b.open ? "var(--color-positive)" : "var(--color-negative)"} />) : type === "candles" || type === "heikin" || type === "renko" ? bars.map((b, i) => { const x = (i / bars.length) * 100; const y = 100 - ((b.close - min) / spread) * 88 - 6; const open = 100 - ((b.open - min) / spread) * 88 - 6; return <g key={i}><line x1={x} x2={x} y1={100 - ((b.high - min) / spread) * 88 - 6} y2={100 - ((b.low - min) / spread) * 88 - 6} stroke={b.close >= b.open ? "var(--color-positive)" : "var(--color-negative)"} /><rect x={x - 0.35} y={Math.min(y, open)} width="0.7" height={Math.max(0.8, Math.abs(y - open))} fill={b.close >= b.open ? "var(--color-positive)" : "var(--color-negative)"} /></g>; }) : <polyline points={pointList} fill={type === "area" ? "var(--color-accent-soft)" : "none"} stroke="var(--color-accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}</svg>; }

function MarketMap({ items }: { items: AttentionItemDTO[] }) { return <div className="market-map">{items.map((i) => { const pct = i.percentChange ?? 0; return <Link href={`/watchlists/${i.watchlistId}?symbol=${i.symbol}`} className={`market-tile ${pct >= 0 ? "up" : "down"}`} key={i.itemId} title={`${i.name} · ${i.currentPrice === null ? "Unavailable" : formatPriceWithCurrency(i.currentPrice, i.symbol, i.currency)} · ${i.status}`}><strong>{i.symbol}</strong><span>{i.name}</span><b>{i.percentChange === null ? "—" : formatPercent(i.percentChange)}</b><small>{i.status}</small></Link>; })}</div>; }
