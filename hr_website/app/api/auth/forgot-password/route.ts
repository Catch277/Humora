/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send a password reset email
 *     description: |
 *       Sends the Supabase Auth recovery email for the given address. The answer is identical whether
 *       or not that address has an account, so this endpoint cannot be used to enumerate the staff of
 *       an organization. The link in the email returns to `GET /api/auth/recovery`, which turns it into
 *       a recovery session.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: The request was accepted and the email is on its way, if the address exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PasswordResetResult'
 *       400:
 *         description: The JSON body is invalid, or email is not a valid address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

type ForgotPasswordRequest = {
  email?: unknown;
};

/** Shape only — Supabase Auth is the authority on whether the address exists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FAILURE_MESSAGE = "Không gửi được email đặt lại mật khẩu. Vui lòng thử lại.";

export async function POST(request: Request) {
  let body: ForgotPasswordRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nội dung yêu cầu phải là JSON hợp lệ." }, { status: 400 });
  }

  if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email.trim())) {
    return NextResponse.json(
      { error: "email là bắt buộc và phải là địa chỉ email hợp lệ." },
      { status: 400 },
    );
  }

  const email = body.email.trim();

  try {
    const supabase = await createSupabaseServerClient();
    // The email has to come back to *us*, not to Supabase's own page: the `code` it carries is
    // exchanged for a recovery session by `/api/auth/recovery`. The PKCE verifier that exchange needs
    // is the cookie this call just stored in the caller's browser, which is also why the link only
    // completes in the browser that asked for it.
    const redirectTo = new URL("/api/auth/recovery", request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      // Rate limiting is the one failure worth naming: the answer is "wait", not "try again".
      if (error.status === 429) {
        return NextResponse.json(
          { error: "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau." },
          { status: 429 },
        );
      }

      console.error("Failed to send the password reset email", error);
      return NextResponse.json({ error: FAILURE_MESSAGE }, { status: 500 });
    }

    // No "does this address exist" in the answer, on purpose: Supabase answers the same either way.
    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error("Failed to send the password reset email", error);
    return NextResponse.json({ error: FAILURE_MESSAGE }, { status: 500 });
  }
}
