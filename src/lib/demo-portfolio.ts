// DEMO / SYNTHETIC PORTFOLIO DATA — not real holdings, not persisted.
//
// This is deliberately separate from the attention/market pipeline
// (src/server/modules/market, src/server/modules/attention). That
// pipeline computes "what changed since you last looked" from real
// PriceObservation history and must never be fed fabricated numbers
// (see PROJECT_SPEC.md's "never fabricate market data or change
// scores" principle, and DECISIONS.md #17/#28).
//
// A portfolio P&L view needs something the schema doesn't model yet —
// *positions* (quantity + average buy price) — which is a materially
// different concept from a watchlist (a list of symbols with no
// ownership/quantity attached). Rather than bolt fabricated "current
// price"/"P&L" fields onto the real Instrument/PriceObservation
// pipeline, or invent a Position/Holding Prisma model + migration that
// can't be verified against a live database in this environment (the
// same binaries.prisma.sh restriction documented in DECISIONS.md #2),
// this module is a single, explicitly-labeled, deterministic demo-data
// service — the UI layer that renders it always carries a visible
// "Demo · Synthetic Data" badge (see DashboardHeader / PortfolioSummary)
// so it is never presented as, or mistaken for, live account data.
//
// Deterministic by construction: every figure is *derived* from a
// per-symbol seed (mulberry32, same style as
// server/modules/market/providers/simulated.provider.ts) — quantity and
// average buy price are generated once per symbol, current price and
// today's change are generated once per symbol per call, and every
// portfolio-level total (invested, current value, P&L, today's P&L) is
// summed from the individual holdings rather than being its own
// hardcoded number. Nothing here is random noise with no relationship
// to the rest of the figures.

export interface DemoHolding {
  symbol: string;
  name: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  prevClosePrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  todayPnl: number;
  todayPnlPercent: number;
}

export interface DemoPortfolioSummary {
  investedValue: number;
  currentValue: number;
  // Gross P&L — currentValue minus investedValue, before any charges.
  // `totalPnl`/`totalPnlPercent` names are kept (rather than renamed to
  // `grossPnl`) since this is what the rest of the codebase already
  // calls it; the "gross" framing is new in the UI layer only.
  totalPnl: number;
  totalPnlPercent: number;
  // Deterministic estimate of what a discount broker would charge to
  // realize this position today (brokerage + STT + exchange/SEBI fees +
  // stamp duty + GST, folded into one figure) — clearly labeled "Est."
  // everywhere it's shown, never presented as an exact/real charge.
  estimatedCharges: number;
  // Net P&L = gross P&L − estimated charges. What Groww itself calls
  // "net returns" vs. "total returns" on its own holdings page — this
  // mirrors that distinction rather than inventing a new one.
  netPnl: number;
  netPnlPercent: number;
  todayPnl: number;
  todayPnlPercent: number;
  holdingsCount: number;
}

// Cadence the demo portfolio "ticks" at when a caller wants it to feel
// live (see Holdings.tsx) — short enough that a few seconds of watching
// visibly shows a new number, long enough that it still reads as
// deliberate movement rather than jitter. Exported so the bucket size
// used to compute a snapshot and the interval used to poll for a new
// one stay in sync at a single source of truth.
export const DEMO_LIVE_BUCKET_MS = 15_000;

export type ChartRange = "1D" | "1W" | "1M" | "1Y";

export interface ChartPoint {
  t: number; // ms epoch, synthetic
  v: number; // portfolio value at that point
}

// Same 10 NSE symbols the simulated market provider already curates
// (server/modules/market/providers/simulated.provider.ts) — kept in
// sync deliberately so a symbol shown in the "holdings" table matches
// one that also exists in the real attention/watchlist demo flow if a
// user adds it there.
const DEMO_SYMBOLS: Array<{ symbol: string; name: string; exchange: string; base: number }> = [
  { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", base: 2940 },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", base: 3850 },
  { symbol: "INFY", name: "Infosys", exchange: "NSE", base: 1650 },
  { symbol: "HDFCBANK", name: "HDFC Bank", exchange: "NSE", base: 1685 },
  { symbol: "ICICIBANK", name: "ICICI Bank", exchange: "NSE", base: 1245 },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", base: 825 },
  { symbol: "ITC", name: "ITC Limited", exchange: "NSE", base: 465 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", exchange: "NSE", base: 1590 },
  { symbol: "LT", name: "Larsen & Toubro", exchange: "NSE", base: 3610 },
  { symbol: "MARUTI", name: "Maruti Suzuki", exchange: "NSE", base: 12480 },
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic holdings for the demo portfolio. `asOfBucket` lets the
 * whole set drift slowly over time (e.g. per-hour) without being
 * re-randomized on every render, so the dashboard stays visually stable
 * within a session while still not being a single frozen snapshot.
 */
export function getDemoHoldings(asOfBucket: number = Math.floor(Date.now() / (1000 * 60 * 15))): DemoHolding[] {
  return DEMO_SYMBOLS.map(({ symbol, name, exchange, base }) => {
    const rng = mulberry32(hashSeed(symbol) + asOfBucket);

    // Quantity and average buy price are "position" facts — generated
    // once per symbol per bucket, held fixed for the rest of the
    // derivation so invested value is a true qty * avgPrice product.
    const quantity = 5 + Math.floor(rng() * 46); // 5–50 shares
    const avgBuyPrice = round2(base * (0.85 + rng() * 0.3)); // bought 15% below to 15% above base

    // Previous close drifts a little from base; current price drifts a
    // little from previous close — same "small fluctuation, occasional
    // bigger move" shape as the simulated market provider, just
    // computed independently (this module has no dependency on it).
    const prevClosePrice = round2(base * (0.97 + rng() * 0.06));
    const moveRoll = rng();
    const moveMagnitude =
      moveRoll < 0.7 ? rng() * 0.012 : moveRoll < 0.93 ? 0.012 + rng() * 0.018 : 0.03 + rng() * 0.03;
    const moveDirection = rng() > 0.45 ? 1 : -1; // slight upward bias, not a coin flip either way
    const currentPrice = round2(prevClosePrice * (1 + moveDirection * moveMagnitude));

    const investedValue = round2(quantity * avgBuyPrice);
    const currentValue = round2(quantity * currentPrice);
    const pnl = round2(currentValue - investedValue);
    const pnlPercent = investedValue > 0 ? round2((pnl / investedValue) * 100) : 0;
    const todayPnl = round2(quantity * (currentPrice - prevClosePrice));
    const todayPnlPercent = prevClosePrice > 0 ? round2(((currentPrice - prevClosePrice) / prevClosePrice) * 100) : 0;

    return {
      symbol,
      name,
      exchange,
      quantity,
      avgBuyPrice,
      currentPrice,
      prevClosePrice,
      investedValue,
      currentValue,
      pnl,
      pnlPercent,
      todayPnl,
      todayPnlPercent,
    };
  });
}

// Estimated all-in charges to realize a position today — brokerage +
// STT + exchange/SEBI charges + stamp duty + GST folded into one rate,
// applied to buy-side + sell-side turnover. Modeled on typical Indian
// discount-broker delivery charges (order of magnitude, not a precise
// fee schedule); deliberately derived from `investedValue`/
// `currentValue` rather than its own random figure, and always shown
// labeled "Est." in the UI.
const ESTIMATED_CHARGE_RATE = 0.0012; // ~0.12% of turnover

/** Portfolio-level totals — every field summed from `getDemoHoldings()`, never its own hardcoded number. */
export function getDemoPortfolioSummary(holdings: DemoHolding[] = getDemoHoldings()): DemoPortfolioSummary {
  const investedValue = round2(holdings.reduce((s, h) => s + h.investedValue, 0));
  const currentValue = round2(holdings.reduce((s, h) => s + h.currentValue, 0));
  const todayPnl = round2(holdings.reduce((s, h) => s + h.todayPnl, 0));
  const totalPnl = round2(currentValue - investedValue);
  const totalPnlPercent = investedValue > 0 ? round2((totalPnl / investedValue) * 100) : 0;
  const yesterdayValue = currentValue - todayPnl;
  const todayPnlPercent = yesterdayValue > 0 ? round2((todayPnl / yesterdayValue) * 100) : 0;
  const estimatedCharges = round2((investedValue + currentValue) * ESTIMATED_CHARGE_RATE);
  const netPnl = round2(totalPnl - estimatedCharges);
  const netPnlPercent = investedValue > 0 ? round2((netPnl / investedValue) * 100) : 0;

  return {
    investedValue,
    currentValue,
    totalPnl,
    totalPnlPercent,
    estimatedCharges,
    netPnl,
    netPnlPercent,
    todayPnl,
    todayPnlPercent,
    holdingsCount: holdings.length,
  };
}

const RANGE_POINTS: Record<ChartRange, number> = { "1D": 48, "1W": 42, "1M": 30, "1Y": 52 };
const RANGE_SPAN_MS: Record<ChartRange, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
};

/**
 * Synthetic historical portfolio-value series for the performance chart.
 * Deterministic per range (same seed every call for a given range), a
 * random walk with drift so it looks like plausible market movement —
 * not a straight line, not pure noise — and always ends at the current
 * `getDemoPortfolioSummary().currentValue` so the chart and the summary
 * cards never disagree with each other.
 */
export function getDemoPortfolioSeries(range: ChartRange): ChartPoint[] {
  const summary = getDemoPortfolioSummary();
  const points = RANGE_POINTS[range];
  const span = RANGE_SPAN_MS[range];
  const now = Date.now();
  const rng = mulberry32(hashSeed(`portfolio-series-${range}`));

  // Walk backward from the current (known) value so the series is
  // guaranteed to land exactly on today's real total, then reverse.
  const values: number[] = [summary.currentValue];
  let v = summary.currentValue;
  for (let i = 1; i < points; i++) {
    const stepVolatility = range === "1D" ? 0.0025 : range === "1W" ? 0.005 : range === "1M" ? 0.009 : 0.014;
    const drift = 0.0006; // slight net-positive drift walking backward implies net-positive forward drift
    const step = (rng() - 0.5) * 2 * stepVolatility - drift;
    v = v / (1 + step);
    values.push(round2(v));
  }
  values.reverse();

  return values.map((value, i) => ({
    t: now - span + (span * i) / (points - 1),
    v: value,
  }));
}
