import { NextResponse } from "next/server";
import { clearCurrentUserCookie } from "@/server/lib/current-user";

// POST /api/auth/logout — clears the identity cookie. The next API call
// (e.g. the dashboard's own watchlist fetch) transparently gets a fresh
// anonymous user via getOrCreateCurrentUserId, consistent with the
// existing anonymous-cookie architecture (DECISIONS.md #7) — logging out
// doesn't lock the demo dashboard, it just resets "who you are".
export async function POST() {
  clearCurrentUserCookie();
  return NextResponse.json({ ok: true });
}
