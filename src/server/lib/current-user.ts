import { cookies } from "next/headers";
import { prisma } from "@/server/db/prisma";

const COOKIE_NAME = "pw_uid";
// Separate, deliberately simple "did this browser actually go through
// /login or /signup" flag. `pw_uid` alone can't answer that — it's set
// for anonymous visitors too (see getOrCreateCurrentUserId below) — so
// AUTH-FIRST gating (middleware.ts) checks this flag instead. It carries
// no identity information itself, just a boolean, which keeps it safe to
// read from the Edge middleware without a database round trip.
const AUTHED_COOKIE_NAME = "pw_authed";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

// PulseWatch has not implemented real authentication yet — that remains a
// deliberate deferral (see DECISIONS.md #6). To make watchlist CRUD usable
// and demoable in this iteration without bolting on a half-considered auth
// flow, each browser is assigned an anonymous `User` row via an httpOnly
// cookie the first time it hits an API route. All watchlist data is scoped
// to that user, so different browsers/devices see different watchlists.
//
// This is intentionally the ONLY place that knows about cookies or
// anonymous-user creation. Every other module (watchlist service, API
// routes' business logic) depends only on a plain `userId: string`.
// Replacing this with real session-based auth later means changing this
// one function — nothing downstream needs to change.
export async function getOrCreateCurrentUserId(): Promise<string> {
  const cookieStore = cookies();
  const existingId = cookieStore.get(COOKIE_NAME)?.value;

  if (existingId) {
    const user = await prisma.user.findUnique({ where: { id: existingId } });
    if (user) {
      return user.id;
    }
    // Cookie pointed at a user that no longer exists (e.g. database was
    // reset) — fall through and create a fresh one.
  }

  const user = await prisma.user.create({
    data: { email: `anon-${crypto.randomUUID()}@pulsewatch.local` },
  });

  cookieStore.set(COOKIE_NAME, user.id, {
    httpOnly: true,
    sameSite: "lax",
    // Secure in production (requires HTTPS) so the identity cookie is
    // never sent over plaintext; omitted in development so the app still
    // works over plain http://localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return user.id;
}

// --- Demo login/signup ------------------------------------------------
//
// Still no external auth provider and still no password field on `User`
// (see DECISIONS.md #6) — this is deliberately a demo-grade identity
// switch, not real authentication. "Signing up" or "logging in" with an
// email finds-or-creates a `User` row for that email and points the same
// `pw_uid` cookie at it, so a returning visitor who types the same email
// sees the same watchlists again. The password field is validated as
// non-empty client- and server-side but is never stored or checked
// against anything, exactly as the brief asks for ("accept ANY
// non-empty values for demo purposes").
export async function loginOrSignupWithEmail(email: string): Promise<{ id: string; email: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized },
  });

  cookies().set(COOKIE_NAME, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  // Not httpOnly: middleware reads it, and the client never needs to.
  // It's a boolean flag, not a credential, so this is safe to expose.
  cookies().set(AUTHED_COOKIE_NAME, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return { id: user.id, email: user.email };
}

// Read-only lookup for "who is signed in", used by /api/auth/me and the
// header — never auto-creates a user, unlike getOrCreateCurrentUserId
// (which every watchlist/attention route deliberately still uses, so
// the dashboard keeps working for a visitor who never went through
// /login — see DECISIONS.md #7).
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const existingId = cookies().get(COOKIE_NAME)?.value;
  if (!existingId) return null;
  const user = await prisma.user.findUnique({ where: { id: existingId } });
  if (!user) return null;
  // Anonymous users created by getOrCreateCurrentUserId carry a synthetic
  // "anon-*@pulsewatch.local" email — treat those as "not signed in" for
  // display purposes so the header shows "Log in", not a random id.
  if (user.email.startsWith("anon-") && user.email.endsWith("@pulsewatch.local")) {
    return null;
  }
  return { id: user.id, email: user.email };
}

export function clearCurrentUserCookie(): void {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  cookies().set(AUTHED_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
