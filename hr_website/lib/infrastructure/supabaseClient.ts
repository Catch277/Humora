import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  SESSION_SCOPE_COOKIE,
  applySessionScope,
  sessionScopeOf,
} from "@/lib/infrastructure/sessionScope";

/** Creates a request-scoped Supabase client for App Router server code. */
export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();
  // "Ghi nhớ đăng nhập" travels as this marker, because the library decides the lifetime of the auth
  // cookies when it writes them (see `sessionScope.ts`). Every write below respects it, so a token refresh
  // on some later request cannot turn a session-only login into a remembered device.
  const scope = sessionScopeOf(
    cookieStore.get(SESSION_SCOPE_COOKIE)?.value,
  );

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          applySessionScope(cookiesToSet, scope).forEach(
            ({ name, value, options }) => {
              cookieStore.set(name, value, options);
            },
          );
        } catch {
          // Server Components cannot write cookies. Route handlers can; a
          // middleware should refresh sessions for all other server renders.
        }
      },
    },
  });
}
