import { createBrowserClient } from "@supabase/ssr";

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
 * the server) and no service-role key anywhere.
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

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

  return browserClient;
}
