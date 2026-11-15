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
 *
 *       The return URL is built from `SITE_URL` when that variable holds an absolute http(s) URL and
 *       from the request origin otherwise, so a deployment answers with its real domain instead of the
 *       preview alias that happened to serve this POST.
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

/**
 * Where the recovery mail sends the account back to.
 *
 * `request.url` is whichever host answered this POST, which on a deployment platform is often an alias
 * (`<project>-git-main-….vercel.app`) — and a preview alias sits behind the platform's own sign-in page,
 * so the mail would ask the reader to log in to the host rather than to this app. `SITE_URL` pins the
 * canonical origin; it is server-only on purpose (no client bundle needs it, so it is not
 * `NEXT_PUBLIC_`). A missing or malformed value is ignored, which keeps a local run without the variable
 * working exactly as before.
 */
function recoveryRedirectUrl(request: Request): string {
  let origin = new URL(request.url).origin;
  const configured = process.env.SITE_URL?.trim();

  if (configured) {
    try {
      const parsed = new URL(configured);

      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origin = parsed.origin;
      } else {
        console.error("SITE_URL must be an absolute http(s) URL; using the request origin instead.");
      }
    } catch {
      console.error("SITE_URL is not a valid URL; using the request origin instead.");
    }
  }

  return new URL("/api/auth/recovery", origin).toString();
}

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
    // The email has to come back to *us*, not to Supabase's own page: the token it carries is turned
    // into a recovery session by `/api/auth/recovery`. The PKCE verifier a `code` link needs is the
    // cookie this call just stored in the caller's browser.
    const redirectTo = recoveryRedirectUrl(request);
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
