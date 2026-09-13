"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AttentionItemDTO } from "@/types/attention";

// "Market Pulse" — a compact visual read on the same watchlist data
// AttentionSection renders as cards, not a decorative animation running
// on its own numbers. Each node is one real tracked instrument (capped to
// the top few by attentionScore, which the API already sorts by); node
// color follows real movement direction, node size follows the real
// attentionScore, and the pulsing halo is reserved for instruments the
// attention engine actually classified as SIGNIFICANT. No node, position,
// or color is hardcoded — everything is derived from `items`.
//
// The tasteful-3D requirement is met with a lightweight CSS
// perspective/rotate tilt (no three.js/@react-three/fiber — unnecessary
// weight for a dozen SVG circles), nudged gently by pointer position via
// framer-motion springs, and skipped entirely under
// prefers-reduced-motion.
interface MarketPulseProps {
  items: AttentionItemDTO[];
}

const MAX_NODES = 8;
const SIZE = 280;
const CENTER = SIZE / 2;
const RING_RADIUS = SIZE * 0.36;

function directionOf(item: AttentionItemDTO): "up" | "down" | "flat" {
  if (item.absoluteChange === null || item.absoluteChange === 0) return "flat";
  return item.absoluteChange > 0 ? "up" : "down";
}

function nodeColorClass(item: AttentionItemDTO): string {
  if (item.status === "UNAVAILABLE") return "pulse-node-unavailable";
  if (item.status === "STALE") return "pulse-node-stale";
  const dir = directionOf(item);
  if (dir === "up") return "pulse-node-up";
  if (dir === "down") return "pulse-node-down";
  return "pulse-node-flat";
}

export default function MarketPulse({ items }: MarketPulseProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const nodes = useMemo(() => {
    const tracked = items.filter((i) => i.status !== "UNAVAILABLE");
    const chosen = (tracked.length > 0 ? tracked : items).slice(0, MAX_NODES);
    const count = chosen.length;
    return chosen.map((item, i) => {
      const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = RING_RADIUS;
      const x = CENTER + Math.cos(angle) * radius;
      const y = CENTER + Math.sin(angle) * radius;
      const score = Math.max(8, Math.min(100, item.attentionScore));
      const r = 3.5 + (score / 100) * 5.5;
      return { item, x, y, r, colorClass: nodeColorClass(item) };
    });
  }, [items]);

  const significantCount = items.filter((i) => i.status === "SIGNIFICANT").length;
  const trackedCount = items.filter((i) => i.status !== "UNAVAILABLE").length;

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (prefersReducedMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: relY * -8, y: relX * 10 });
  }

  function handlePointerLeave() {
    setTilt({ x: 0, y: 0 });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="market-pulse-panel liquid-glass">
      <div className="market-pulse-header">
        <p className="attention-eyebrow">Market pulse</p>
        <p className="market-pulse-copy">
          Watching {trackedCount} {trackedCount === 1 ? "instrument" : "instruments"}
          {significantCount > 0
            ? ` — ${significantCount} moving significantly right now.`
            : " across your watchlists."}
        </p>
      </div>

      <div
        ref={containerRef}
        className="market-pulse-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <motion.div
          className="market-pulse-tilt"
          animate={
            prefersReducedMotion
              ? { rotateX: 0, rotateY: 0 }
              : { rotateX: tilt.x, rotateY: tilt.y }
          }
          transition={{ type: "spring", stiffness: 60, damping: 14 }}
        >
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width="100%"
            height="100%"
            role="img"
            aria-label={`Market pulse: ${trackedCount} instruments tracked, ${significantCount} moving significantly`}
          >
            {nodes.map(({ item, x, y }) => (
              <line
                key={`line-${item.itemId}`}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                className="pulse-line"
                style={{ opacity: 0.12 + (item.attentionScore / 100) * 0.3 }}
              />
            ))}

            <circle cx={CENTER} cy={CENTER} r={10} className="pulse-core" />
            {!prefersReducedMotion && (
              <circle cx={CENTER} cy={CENTER} r={10} className="pulse-core-ring" />
            )}

            {nodes.map(({ item, x, y, r, colorClass }) => (
              <g key={item.itemId}>
                {!prefersReducedMotion && item.status === "SIGNIFICANT" && (
                  <circle cx={x} cy={y} r={r} className={`pulse-node-halo ${colorClass}`} />
                )}
                <circle cx={x} cy={y} r={r} className={`pulse-node ${colorClass}`}>
                  <title>
                    {item.symbol} · {item.status}
                  </title>
                </circle>
              </g>
            ))}
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
