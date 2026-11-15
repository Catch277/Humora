import type { CookieOptions } from "@supabase/ssr";

/**
 * How long this device keeps the Supabase session — the "Ghi nhớ đăng nhập" box on `/login`.
 *
 * Nothing here stores a password. A session is the access token plus the refresh token Supabase Auth writes
 * into its own cookies, so "remember me" only decides **whether those cookies outlive the browser**: a
 * `device` login keeps the library's 400-day cookie, a `session` login is re-written without `maxAge`/
 * `expires` and the browser drops it when it closes.
 *
 * Why a marker cookie instead of a parameter on the sign-in call: `@supabase/ssr` chooses the lifetime
 * itself — `cookieOptions` cannot shorten it (`applyServerStorage` and the storage's `setItem` overwrite
 * `maxAge` on every write) — and the same library re-writes the cookies whenever it refreshes a token,
 * which happens in `proxy.ts` on some later request, long after the sign-in route returned. Recording the
 * choice once and applying it at every write is the only way the box stays true an hour later.
 *
 * The marker is deliberately not `httpOnly`: `/login` has to set it *before* the sign-in request so the
 * route handler's client can see it. It carries no secret — "does this device keep the session" is the
 * user's own decision either way.
 */
export const SESSION_SCOPE_COOKIE = "humora-session-scope";

/** The two values the marker holds. Anything else reads as `device`, which is what the app did before. */
export type SessionScope = "device" | "session";

/** 400 days — the lifetime `@supabase/ssr` gives the refresh-token cookie this marker is paired with. */
export const SESSION_SCOPE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Absent or unreadable means `device`: an existing browser keeps the behaviour it already had. */
export function sessionScopeOf(value: string | null | undefined): SessionScope {
  return value === "session" ? "session" : "device";
}

/** One cookie a Supabase client is about to write, before it reaches any cookie store. */
export type ScopedAuthCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Drops the expiry from the auth cookies of a `session`-scoped login. A cookie without `maxAge`/`expires`
 * is a session cookie, so closing the browser ends the login; a `device`-scoped login is passed through
 * exactly as the library wrote it.
 *
 * A **deletion** is left alone. `@supabase/ssr` removes a cookie by writing it empty with `maxAge: 0` in
 * this same array, and stripping that `maxAge` would turn the removal into an empty session cookie — the
 * row would survive `/api/auth/sign-out` instead of disappearing.
 */
export function applySessionScope(
  cookies: readonly ScopedAuthCookie[],
  scope: SessionScope,
): ScopedAuthCookie[] {
  if (scope === "device") {
    return [...cookies];
  }

  return cookies.map((cookie) => {
    const sessionOptions = { ...cookie.options };

    if (isRemoval(sessionOptions)) {
      return { ...cookie, options: sessionOptions };
    }

    delete sessionOptions.maxAge;
    delete sessionOptions.expires;

    return { ...cookie, options: sessionOptions };
  });
}

/** `maxAge <= 0` is how the package (and every cookie helper) spells "delete this cookie". */
function isRemoval(options: CookieOptions): boolean {
  return typeof options.maxAge === "number" && options.maxAge <= 0;
}

/**
 * Browser only. Reads the marker the way the server does, but from `document.cookie` — this is what the
 * browser Supabase client asks on every write, so a token it refreshes on `/security` cannot quietly turn a
 * "do not remember me" login into a 400-day one.
 */
export function readStoredSessionScope(): SessionScope {
  const marker = readBrowserCookies().find(
    (cookie) => cookie.name === SESSION_SCOPE_COOKIE,
  );

  return sessionScopeOf(marker?.value);
}

/**
 * Browser only. Records the choice for the sign-in request that follows (and for every later refresh).
 * A `session` marker is itself a session cookie: nothing about this device outlives the browser.
 */
export function writeStoredSessionScope(scope: SessionScope): void {
  const lifetime =
    scope === "device"
      ? `; max-age=${SESSION_SCOPE_COOKIE_MAX_AGE_SECONDS}`
      : "";

  writeBrowserCookie(
    `${SESSION_SCOPE_COOKIE}=${scope}; path=/; samesite=lax${lifetime}`,
  );
}

/**
 * Browser only. Every `name=value` pair `document.cookie` exposes, which is what a browser Supabase client
 * needs as its `getAll`. The library encodes its values as base64url, so a value never holds `;` and the
 * first `=` is the separator.
 */
export function readBrowserCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined" || !document.cookie) {
    return [];
  }

  return document.cookie
    .split("; ")
    .filter((pair) => pair !== "")
    .map((pair) => {
      const separator = pair.indexOf("=");

      return separator === -1
        ? { name: pair, value: "" }
        : { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
    });
}

/**
 * Browser only. Writes the cookies a browser Supabase client just produced, with the lifetime this device
 * asked for. `httpOnly` is not honoured — JavaScript cannot set it — but the library's own default is
 * `httpOnly: false`, which is what lets this client read the session it stores; a value that must stay out
 * of reach of scripts belongs in a cookie the server sets.
 */
export function writeBrowserCookies(
  cookies: readonly ScopedAuthCookie[],
): void {
  const scope = readStoredSessionScope();

  for (const { name, value, options } of applySessionScope(cookies, scope)) {
    const attributes = [`${name}=${value}`, `path=${options.path ?? "/"}`];

    if (typeof options.sameSite === "string") {
      attributes.push(`samesite=${options.sameSite}`);
    } else if (options.sameSite === true) {
      attributes.push("samesite=strict");
    }

    if (options.secure) {
      attributes.push("secure");
    }

    if (typeof options.maxAge === "number") {
      attributes.push(`max-age=${options.maxAge}`);
    }

    if (options.expires instanceof Date) {
      attributes.push(`expires=${options.expires.toUTCString()}`);
    }

    writeBrowserCookie(attributes.join("; "));
  }
}

function writeBrowserCookie(cookie: string): void {
  try {
    document.cookie = cookie;
  } catch {
    /* Cookie bị chặn: phiên vẫn dùng được trong trang này, chỉ là không ghi nhớ được lựa chọn. */
  }
}
