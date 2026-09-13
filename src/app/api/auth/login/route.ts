import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJsonBody } from "@/server/lib/api-response";
import { loginOrSignupWithEmail } from "@/server/lib/current-user";

// POST /api/auth/login — demo login. Any non-empty email/password is
// accepted (see current-user.ts); logging in with an email that already
// signed up returns to the same watchlists, logging in with a new one
// creates it on the fly, matching a frictionless demo flow rather than
// a real credential check.
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const { email } = loginSchema.parse(body);
    const user = await loginOrSignupWithEmail(email);
    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
