/**
 * @swagger
 * /api/auth/recovery:
 *   get:
 *     summary: Complete a password reset link
 *     description: |
 *       The page a Supabase Auth recovery email returns to. It exchanges the one-time `code` for a
 *       recovery session and redirects to `/reset-password`, where the new password is saved through
 *       `POST /api/auth/change-password`. A link that is missing, expired or already used lands on
 *       `/login?recovery=failed` instead of a screen whose save would be refused.
 *
 *       The `code` is PKCE-bound (`@supabase/ssr` pins `flowType: "pkce"` for both of its clients), so
 *       the link completes only in the browser that requested it — the code verifier is a cookie there.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         description: The one-time code Supabase Auth appends to the recovery link.
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
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
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

  // Passing the flow id is what the library documents for a server-side callback: without it the
  // verifier lookup falls back to "any stored flow", which is fine for a single request but cannot
  // tell a replayed link from a fresh one.
  const flowId = request.nextUrl.searchParams.get(FLOW_ID_PARAM);
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error) {
    console.error("Failed to exchange the recovery code", error);
    return NextResponse.redirect(new URL(FAILED_PATH, request.url));
  }

  return success;
}
