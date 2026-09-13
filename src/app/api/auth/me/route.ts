import { NextResponse } from "next/server";
import { errorResponse } from "@/server/lib/api-response";
import { getCurrentUser } from "@/server/lib/current-user";

// GET /api/auth/me — who's signed in, or null. Deliberately read-only
// (never auto-creates a user, unlike every watchlist/attention route) so
// the header can tell "signed in with a real email" apart from "an
// anonymous cookie the dashboard created on its own".
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err);
  }
}
