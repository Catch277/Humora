import { createBrowserClient } from "@supabase/ssr";

import {
  readBrowserCookies,
  writeBrowserCookies,
} from "@/lib/infrastructure/sessionScope";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

/**
 * The browser-side Supabase client (SCRUM-79), which exists for exactly one reason: a WebAuthn ceremony
 * (`navigator.credentials.create()` / `.get()`) only runs in a browser, so registering a passkey on
 * `/security` and signing in with one on `/login` cannot go through a route handler the way every other
 * call in this app does. Passkeys themselves live in Supabase Auth (`auth.*`), not in a table of ours.
 *
 * It writes the same auth cookies the request-scoped server client reads (`createServerClient` in
 * `supabaseClient.ts`), so `proxy.ts`, `requireCaller()` and RLS keep working unchanged: one session, no
 * `auth.storage` (the package persists to cookies on purpose, which is what makes the session visible to
 * the server) and no service-role key anywhere. Its cookie adapter is `sessionScope.ts` rather than the
 * package's own `document.cookie` helpers, so the "Ghi nhớ đăng nhập" choice on `/login` also applies to a
 * token this client refreshes while a screen is open.
 *
 * Call it lazily, from an event handler or an effect — at module scope it would touch `document.cookie`
 * while a server render evaluates the module. `createBrowserClient` already returns one instance per
 * browser context (`isSingleton`), and caching it here keeps that explicit for readers.
 */
let browserClient: BrowserSupabaseClient | null = null;

export function getBrowserSupabaseClient(): BrowserSupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  if (typeof window === "undefined") {
    throw new Error("Client Supabase chỉ dùng được trong trình duyệt.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    /*
      The package reads and writes `document.cookie` on its own, but it gives every cookie it writes a
      400-day `maxAge`. Routing both halves through `sessionScope.ts` is what keeps a "không ghi nhớ"
      login a session cookie even when this client refreshes the token (it does, on `/security`).
    */
    cookies: {
      getAll() {
        return readBrowserCookies();
      },
      setAll(cookiesToSet) {
        writeBrowserCookies(cookiesToSet);
      },
    },
  });

  return browserClient;
}
