import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// AUTH-FIRST gate. Runs on the Edge before any page renders, so an
// unauthenticated visitor to localhost never sees the dashboard flash
// before redirecting — they land straight on /login.
//
// Deliberately cheap: it only checks for the presence of the `pw_authed`
// cookie set by loginOrSignupWithEmail() (see server/lib/current-user.ts).
// No database call here — middleware runs on every request and the Edge
// runtime doesn't have a Postgres connection anyway. Real identity
// resolution still happens per-request in the API routes via
// getOrCreateCurrentUserId / getCurrentUser, same as before.
const AUTHED_COOKIE_NAME = "pw_authed";
const PUBLIC_PATHS = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (isPublic) {
    return NextResponse.next();
  }

  const isAuthed = request.cookies.get(AUTHED_COOKIE_NAME)?.value === "1";
  if (!isAuthed) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Everything except: API routes (auth needs to work without being
// redirected mid-request), Next internals, and static assets.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
