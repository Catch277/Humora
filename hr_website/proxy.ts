import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { canAccessScreen, firstAccessiblePath } from "@/lib/accessPolicy";
import { isPublicPath } from "@/lib/publicPaths";

/** Screens that belong to onboarding: reachable while the account has no organization yet. */
const ONBOARDING_PATH = "/onboarding";
const CHANGE_PASSWORD_PATH = "/change-password";

type MembershipState = {
  organizationId: string | null;
  mustChangePassword: boolean;
  /**
   * `users.role`, kept raw: a database that has not run `SCRUM-59_role_model.sql` still answers the
   * pre-rename `CHU`, and `canAccessScreen` normalises it through `lib/domain/roles.ts`.
   */
  role: string | null;
};

/**
 * The onboarding gates (SCRUM-51/52) need one read of the caller's `users` row. It answers `null`
 * when that row — or the columns this script adds — is not there yet, and both gates are skipped in
 * that case: blocking every screen because a script has not been applied would be worse than the
 * behaviour before the gate existed.
 *
 * `role` joined that read with SCRUM-59, which is what lets the same query also answer "may this
 * account open this screen?".
 */
async function loadMembershipState(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<MembershipState | null> {
  const { data, error } = await supabase
    .from("users")
    .select("organization_id, must_change_password, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as {
    organization_id: string | null;
    must_change_password: boolean | null;
    role: string | null;
  };

  return {
    organizationId: row.organization_id ?? null,
    mustChangePassword: row.must_change_password === true,
    role: row.role ?? null,
  };
}

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behaviour, but it defaults to the
 * Node.js runtime and rejects a `runtime` export). This performs the optimistic auth check
 * and refreshes the Supabase session cookies; the authoritative gate stays the `401` inside
 * each route handler, which runs against the request-scoped client.
 *
 * It also owns the two onboarding redirects, because it is the only place that knows both the
 * pathname and the session: an account an owner provisioned changes its password first, and an
 * account that belongs to no organization creates or joins one before seeing any data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Without credentials no session can be validated; let the page or route handler
    // surface its own explicit "Missing NEXT_PUBLIC_SUPABASE_…" error instead of looping.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user) {
    const state = await loadMembershipState(supabase, user.id);

    if (state) {
      if (state.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
        return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url));
      }

      if (!state.mustChangePassword && !state.organizationId && pathname !== ONBOARDING_PATH) {
        return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
      }

      if (
        state.organizationId &&
        (pathname === ONBOARDING_PATH || pathname === CHANGE_PASSWORD_PATH)
      ) {
        // Both onboarding screens are done with; the shell is the right place now.
        return NextResponse.redirect(new URL("/", request.url));
      }

      // SCRUM-59: the same table the sidebar reads decides whether this path is the caller's at all.
      // A deep link into a screen the role may not open lands on the first screen it *can* open,
      // instead of rendering a page whose every request would answer 403. `firstAccessiblePath` can
      // never name a path that was just refused, so this cannot loop, and an unrecognised role is
      // let through exactly like the gates above when their data is unavailable.
      const fallback = firstAccessiblePath(state.role);

      if (
        state.role &&
        !canAccessScreen(state.role, pathname) &&
        fallback !== pathname
      ) {
        return NextResponse.redirect(new URL(fallback, request.url));
      }
    }
  }

  return response;
}

export const config = {
  // Everything except API routes (they answer JSON 401s themselves), Next.js assets and
  // public files, so auth redirects can never block CSS, JS or images.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
