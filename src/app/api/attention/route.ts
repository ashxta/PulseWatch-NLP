import { NextResponse } from "next/server";
import { getOrCreateCurrentUserId } from "@/server/lib/current-user";
import { errorResponse } from "@/server/lib/api-response";
import { getAttentionForUser } from "@/server/modules/attention";

export const dynamic = "force-dynamic";

// GET /api/attention — "since your last visit" state for the current
// user's instruments. Optional ?watchlistId= scopes the response to one
// watchlist; omitted, it covers every watchlist the user owns.
//
// Ownership: getAttentionForUser only ever reads watchlists whose userId
// matches the resolved current user (see attention/service.ts). A
// watchlistId belonging to someone else, or one that doesn't exist,
// yields an empty `items` array rather than an error — the same
// don't-leak-existence pattern the watchlist module uses (see
// DECISIONS.md #8).
//
// Partial market-data failures for individual instruments are handled
// inside getAttentionForUser (each instrument is evaluated
// independently), so a single provider hiccup never fails this whole
// response.
export async function GET(req: Request) {
  try {
    const userId = await getOrCreateCurrentUserId();
    const { searchParams } = new URL(req.url);
    const watchlistId = searchParams.get("watchlistId") ?? undefined;
    const items = await getAttentionForUser(userId, watchlistId);
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
