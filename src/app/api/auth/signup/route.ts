import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJsonBody } from "@/server/lib/api-response";
import { loginOrSignupWithEmail } from "@/server/lib/current-user";

// POST /api/auth/signup — demo signup. See current-user.ts for why this
// finds-or-creates by email rather than checking a real password.
const signupSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const { email } = signupSchema.parse(body);
    const user = await loginOrSignupWithEmail(email);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
