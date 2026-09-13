"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { WatchlistSummary } from "@/types/watchlist";
import * as api from "@/lib/api-client";
import AttentionSection from "./AttentionSection";
import ConfirmDialog from "./ConfirmDialog";
import Holdings from "./Holdings";
import MarketPulse from "./MarketPulse";
import MarketSnapshot from "./MarketSnapshot";
import PortfolioSummary from "./PortfolioSummary";
import MarketView from "./MarketView";
import { useAttention } from "@/app/hooks/useAttention";
import { formatPercent } from "@/lib/format";

type LoadState = "loading" | "ready" | "error";

export default function WatchlistsDashboard() {
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<WatchlistSummary | null>(null);

  // Reused for the dashboard-wide metrics strip below the header — same
  // data AttentionSection fetches, so this doesn't add an extra request
  // beyond what the feed itself already needs.
  const { items: attentionItems } = useAttention();

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const { watchlists } = await api.fetchWatchlists();
      setWatchlists(watchlists);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load watchlists");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { watchlist } = await api.createWatchlist(newName.trim());
      setWatchlists((prev) => [...prev, watchlist]);
      setNewName("");
    } catch (err) {
      setCreateError(
        err instanceof api.ApiError ? err.message : "Failed to create watchlist",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleLoadDemo() {
    setDemoBusy(true);
    setCreateError(null);
    try {
      const target = watchlists[0] ?? (await api.createWatchlist("Demo market")).watchlist;
      if (!watchlists[0]) setWatchlists([target]);
      for (const symbol of ["NVDA", "AAPL", "MSFT"]) {
        await api.addSymbol(target.id, symbol);
      }
      // Attention is intentionally evaluated on the next visit so the
      // first quote establishes a real baseline through the normal API.
      window.location.reload();
    } catch (err) {
      setCreateError(err instanceof api.ApiError ? err.message : "Failed to load demo market");
      setDemoBusy(false);
    }
  }

  function startRename(w: WatchlistSummary) {
    setRenamingId(w.id);
    setRenameValue(w.name);
    setRowError(null);
  }

  async function confirmRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setRowBusyId(id);
    setRowError(null);
    try {
      const { watchlist } = await api.renameWatchlist(id, name);
      setWatchlists((prev) => prev.map((w) => (w.id === id ? watchlist : w)));
      setRenamingId(null);
    } catch (err) {
      setRowError(
        err instanceof api.ApiError ? err.message : "Failed to rename watchlist",
      );
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setRowBusyId(id);
    setRowError(null);
    try {
      await api.deleteWatchlist(id);
      setWatchlists((prev) => prev.filter((w) => w.id !== id));
      setDeleteTarget(null);
    } catch (err) {
      setRowError(
        err instanceof api.ApiError ? err.message : "Failed to delete watchlist",
      );
    } finally {
      setRowBusyId(null);
    }
  }

  const totalSymbols = useMemo(
    () => watchlists.reduce((sum, w) => sum + w.itemCount, 0),
    [watchlists],
  );

  const attentionByWatchlist = useMemo(() => {
    const grouped = new Map<string, typeof attentionItems>();
    for (const item of attentionItems) {
      const current = grouped.get(item.watchlistId) ?? [];
      current.push(item);
      grouped.set(item.watchlistId, current);
    }
    return grouped;
  }, [attentionItems]);

  const isFirstRun = loadState === "ready" && watchlists.length === 0;
  const prefersReducedMotion = useReducedMotion();
  const fadeUp = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="page"
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="page-intro">
        <p className="eyebrow">Market overview</p>
        <h1 className="page-heading">Here&rsquo;s what changed.</h1>
        <p className="page-sub">
          Your watchlist, compared with the last time you checked.
        </p>
        <span className="simulated-data-tag">
          <span className="simulated-data-dot" aria-hidden="true" />
          Simulated Market Data — for demo purposes only
        </span>
      </div>

      {/* Hierarchy (I08 revision): header -> editorial intro -> demo
          portfolio hero (clearly-labeled synthetic data) -> performance
          chart -> "Since your last visit" (the real, database-backed
          attention feed - still the product's actual differentiator,
          kept ahead of secondary content) -> market pulse -> market
          snapshot -> holdings table (synthetic) -> watchlists ->
          secondary/quiet info. */}
      <AttentionSection />

      {!isFirstRun && loadState === "ready" && <PortfolioSummary items={attentionItems} totalSymbols={totalSymbols} />}
      {!isFirstRun && loadState === "ready" && <MarketView items={attentionItems} />}

      {!isFirstRun && loadState === "ready" && (
        <MarketPulse items={attentionItems} />
      )}

      {!isFirstRun && loadState === "ready" && (
        <MarketSnapshot
          items={attentionItems}
          watchlistCount={watchlists.length}
          totalSymbols={totalSymbols}
        />
      )}

      {!isFirstRun && loadState === "ready" && <Holdings />}

      <div className="section-heading-block">
        <h2 className="section-heading">Your watchlists</h2>
        <p className="section-sub">Markets you&rsquo;re keeping an eye on.</p>
      </div>
      <form className="form-row" onSubmit={handleCreate}>
        <input
          className="input"
          placeholder="New watchlist name (e.g. Tech, Long-term)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={creating}
          maxLength={80}
        />
        <button className="btn btn-primary" type="submit" disabled={creating || !newName.trim()}>
          {creating ? "Creating…" : "Create watchlist"}
        </button>
      </form>
      {createError && (
        <div className="error-banner" role="alert">
          <span>{createError}</span>
        </div>
      )}

      {loadState === "ready" && totalSymbols === 0 && (
        <div className="demo-setup-card">
          <div>
            <span className="demo-setup-kicker">See the market move</span>
            <span className="demo-setup-copy">
              Add NVDA, AAPL, and MSFT to a real watchlist and watch the simulated feed establish its first baseline.
            </span>
          </div>
          <button className="btn btn-primary" onClick={handleLoadDemo} disabled={demoBusy}>
            {demoBusy ? "Loading demo…" : "Load demo market"}
          </button>
        </div>
      )}

      {rowError && (
        <div className="error-banner" role="alert">
          <span>{rowError}</span>
          <button className="btn btn-icon" onClick={() => setRowError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loadState === "loading" && (
        <div className="loading-state" role="status" aria-live="polite">
          <span className="spinner" />
          Loading watchlists…
        </div>
      )}

      {loadState === "error" && (
        <div className="error-banner" role="alert">
          <span>{loadError}</span>
          <button className="btn" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {isFirstRun && (
        <div className="first-run-state">
          <div className="first-run-icon" aria-hidden="true">
            ◎
          </div>
          <div className="first-run-title">Your market watch starts here.</div>
          <p className="first-run-copy">
            Create a watchlist and PulseWatch will surface meaningful
            changes when you come back. Add your first stocks and we&rsquo;ll
            track what changes while you&rsquo;re away.
          </p>
        </div>
      )}

      {loadState === "ready" && watchlists.length > 0 && (
        <div className="card-list">
          {watchlists.map((w) => (
            <div className="watchlist-row" key={w.id}>
              {renamingId === w.id ? (
                <div className="inline-edit-row">
                  <input
                    className="input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    disabled={rowBusyId === w.id || !renameValue.trim()}
                    onClick={() => confirmRename(w.id)}
                  >
                    Save
                  </button>
                  <button className="btn" onClick={() => setRenamingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <Link href={`/watchlists/${w.id}`} className="watchlist-row-main">
                    <div className="watchlist-row-text">
                      <div className="watchlist-row-name">{w.name}</div>
                      <div className="watchlist-row-meta">
                        {w.itemCount} {w.itemCount === 1 ? "symbol" : "symbols"}
                      </div>
                      {(() => {
                        const items = attentionByWatchlist.get(w.id) ?? [];
                        const meaningful = items.filter((item) =>
                          ["SIGNIFICANT", "CHANGED", "NEW"].includes(item.status),
                        );
                        const topMover = items
                          .filter((item) => item.percentChange !== null)
                          .sort((a, b) =>
                            Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0),
                          )[0];
                        if (!topMover && meaningful.length === 0) return null;
                        return (
                          <div className="watchlist-row-insight">
                            {meaningful.length > 0 && (
                              <span>
                                {meaningful.length} meaningful {meaningful.length === 1 ? "change" : "changes"}
                              </span>
                            )}
                            {topMover && (
                              <span className={topMover.absoluteChange && topMover.absoluteChange < 0 ? "is-down" : "is-up"}>
                                Top mover {topMover.symbol} {formatPercent(topMover.percentChange)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <span className="watchlist-row-arrow" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M5 12h14M13 6l6 6-6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Link>
                  <div className="row-actions">
                    <button className="btn btn-icon" onClick={() => startRename(w)}>
                      Rename
                    </button>
                    <button
                      className="btn btn-icon btn-danger"
                      disabled={rowBusyId === w.id}
                      onClick={() => setDeleteTarget(w)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This removes the watchlist and every symbol on it. This cannot be undone."
        confirmLabel="Delete watchlist"
        danger
        busy={rowBusyId === deleteTarget?.id}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}
