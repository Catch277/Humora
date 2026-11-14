/**
 * @swagger
 * /api/auth/recovery:
 *   get:
 *     summary: Complete a password reset link
 *     description: |
 *       The page a Supabase Auth recovery email returns to. It turns the one-time token into a recovery
 *       session and redirects to `/reset-password`, where the new password is saved through
 *       `POST /api/auth/change-password`. A link that is missing, expired or already used lands on
 *       `/login?recovery=failed` instead of a screen whose save would be refused.
 *
 *       Two link shapes are accepted, because the shape is decided by the Reset Password email template:
 *       `token_hash` (recommended — `{{ .TokenHash }}` verifies on its own, so the link works in whichever
 *       browser opens the mail) and the legacy `code` (`{{ .ConfirmationURL }}`). `@supabase/ssr` pins
 *       `flowType: "pkce"` for both of its clients, so a `code` needs the verifier cookie of the browser
 *       that requested the mail and a link opened elsewhere is refused rather than half-working.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         required: false
 *         description: The one-time code Supabase Auth appends to a PKCE recovery link.
 *         schema:
 *           type: string
 *       - in: query
 *         name: token_hash
 *         required: false
 *         description: The token hash of a `{{ .TokenHash }}` recovery link. Either this or `code` is required.
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         required: false
 *         description: The token type sent beside `token_hash` (`recovery` for this flow).
 *         schema:
 *           type: string
 *       - in: query
 *         name: sb_flow_id
 *         required: false
 *         description: The PKCE flow the code belongs to, appended by `resetPasswordForEmail`.
 *         schema:
 *           type: string
 *     responses:
 *       307:
 *         description: |
 *           Redirect to `/reset-password` when the link was usable, or to `/login?recovery=failed`
 *           when it was not.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RESET_PASSWORD_PATH = "/reset-password";
const FAILED_PATH = "/login?recovery=failed";

/** The query parameter `resetPasswordForEmail` appends to the redirect (`PKCE_FLOW_ID_PARAM`). */
const FLOW_ID_PARAM = "sb_flow_id";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL(FAILED_PATH, request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    return NextResponse.redirect(new URL(FAILED_PATH, request.url));
  }

  // The redirect response is built *first* and the client writes the session cookies straight onto it.
  // `proxy.ts` builds its own client for the same reason: the cookies have to end up on the response
  // this handler returns, and `cookies().set()` (what `createSupabaseServerClient` uses) is not the
  // response a bare `NextResponse.redirect` hands back.
  const success = NextResponse.redirect(new URL(RESET_PASSWORD_PATH, request.url));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          success.cookies.set(name, value, options),
        );
      },
    },
  });

  // A `token_hash` link carries everything it needs, so it completes in whichever browser opens the
  // mail. The `code` branch stays for a project whose template still sends `{{ .ConfirmationURL }}`;
  // there the PKCE verifier cookie is what binds the link to the browser that asked for it.
  //
  // Passing the flow id is what the library documents for a server-side callback: without it the
  // verifier lookup falls back to "any stored flow", which is fine for a single request but cannot
  // tell a replayed link from a fresh one.
  const flowId = params.get(FLOW_ID_PARAM);
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    : await supabase.auth.exchangeCodeForSession(
        code ?? "",
        flowId ? { flowId } : undefined,
      );

  if (error) {
    console.error("Failed to complete the password reset link", error);
    return NextResponse.redirect(new URL(FAILED_PATH, request.url));
  }

  return success;
}
