import type {
  WatchlistSummary,
  WatchlistDetail,
  WatchlistItemDTO,
} from "@/types/watchlist";
import type { AttentionResponse } from "@/types/attention";
import type { HistoricalBar, HistoryRange } from "@/server/modules/market/types";

// Thin fetch wrapper for the watchlist API. Lives outside `src/server` so
// it is safe to import from client components — it only ever talks to our
// own API routes over HTTP, never touches Prisma or other server-only
// modules directly.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (body && typeof body.message === "string" && body.message) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export function fetchWatchlists(): Promise<{ watchlists: WatchlistSummary[] }> {
  return request("/api/watchlists");
}

export function createWatchlist(
  name: string,
): Promise<{ watchlist: WatchlistSummary }> {
  return request("/api/watchlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchWatchlist(
  id: string,
): Promise<{ watchlist: WatchlistDetail }> {
  return request(`/api/watchlists/${id}`);
}

export function renameWatchlist(
  id: string,
  name: string,
): Promise<{ watchlist: WatchlistSummary }> {
  return request(`/api/watchlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteWatchlist(id: string): Promise<void> {
  return request(`/api/watchlists/${id}`, { method: "DELETE" });
}

export function addSymbol(
  id: string,
  symbol: string,
): Promise<{ item: WatchlistItemDTO }> {
  return request(`/api/watchlists/${id}/items`, {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
}

export function removeSymbol(id: string, itemId: string): Promise<void> {
  return request(`/api/watchlists/${id}/items/${itemId}`, {
    method: "DELETE",
  });
}

// --- Demo auth ----------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
}

export function signup(email: string, password: string): Promise<{ user: AuthUser }> {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request("/api/auth/logout", { method: "POST" });
}

export function fetchCurrentUser(): Promise<{ user: AuthUser | null }> {
  return request("/api/auth/me");
}

// "Since your last visit" attention state. Omit watchlistId for every
// watchlist the user owns, or pass one to scope to a single watchlist
// (used by WatchlistDetail).
export function fetchAttention(watchlistId?: string): Promise<AttentionResponse> {
  const qs = watchlistId ? `?watchlistId=${encodeURIComponent(watchlistId)}` : "";
  return request(`/api/attention${qs}`);
}

export function fetchMarketHistory(symbol: string, range: HistoryRange): Promise<{ bars: HistoricalBar[]; source: string; status: "fresh" | "unavailable" }> {
  return request(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`);
}
