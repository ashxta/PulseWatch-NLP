"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttentionItemDTO } from "@/types/attention";
import * as api from "@/lib/api-client";

export type AttentionLoadState = "loading" | "ready" | "error";

// How often the feed silently re-fetches in the background once the
// first load has succeeded, so prices and attention state stay current
// without the user clicking "Refresh." One shared constant (not a
// per-call-site option) so every surface using this hook — AppHeader's
// freshness readout, both dashboard/detail AttentionSection instances,
// watchlist item rows — stays on the same cadence rather than drifting
// out of sync with each other.
const POLL_INTERVAL_MS = 25_000;

export interface UseAttentionResult {
  items: AttentionItemDTO[];
  loadState: AttentionLoadState;
  error: string | null;
  // Re-fetches without resetting `items` visually flickering to empty —
  // callers that want a "loading" flash on manual retry can check
  // loadState themselves; this is primarily used for silent refresh.
  reload: () => Promise<void>;
}

// Single fetch/loading/error implementation for the "since your last
// visit" attention feed, shared by every surface that needs it:
// AttentionSection (the feed itself), WatchlistsDashboard (summary
// stats), and WatchlistDetail/watchlist rows (per-symbol live price +
// freshness). Extracted in Iteration 4 so those surfaces can't drift
// out of sync on loading/error handling the way three separate
// hand-rolled useEffect blocks eventually would.
export function useAttention(watchlistId?: string): UseAttentionResult {
  const [items, setItems] = useState<AttentionItemDTO[]>([]);
  const [loadState, setLoadState] = useState<AttentionLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Guards the background poll from firing before the first load has
  // actually succeeded (avoids a redundant/overlapping fetch if a poll
  // tick landed mid-initial-load), and pauses it again whenever
  // `watchlistId` changes until the fresh reload for that id completes.
  const readyRef = useRef(false);

  const reload = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const { items } = await api.fetchAttention(watchlistId);
      setItems(items);
      setLoadState("ready");
      readyRef.current = true;
    } catch (err) {
      setError(
        err instanceof api.ApiError
          ? err.message
          : "Failed to load your attention feed",
      );
      setLoadState("error");
    }
  }, [watchlistId]);

  // Same fetch as `reload`, but never flips `loadState` to "loading"
  // (that blanks the feed to a skeleton — appropriate for an explicit
  // "Refresh" click, not for something firing every 25s) and never
  // surfaces a transient failure as the error state. If a poll fails
  // (a momentary network blip, a rate-limited provider), the last
  // known-good `items` just stay on screen and the next tick retries.
  const pollSilently = useCallback(async () => {
    if (!readyRef.current || document.hidden) return;
    try {
      const { items } = await api.fetchAttention(watchlistId);
      setItems(items);
    } catch {
      // Intentionally silent — see comment above.
    }
  }, [watchlistId]);

  useEffect(() => {
    readyRef.current = false;
    reload();
  }, [reload]);

  useEffect(() => {
    const id = setInterval(pollSilently, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollSilently]);

  return { items, loadState, error, reload };
}
