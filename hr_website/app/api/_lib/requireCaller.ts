import { NextResponse } from "next/server";

import { can, type Capability } from "@/lib/accessPolicy";
import type { User } from "@/lib/domain/entities/User";
import { MissingUserProfileError } from "@/lib/domain/errors/MissingUserProfileError";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { GetUserUseCase } from "@/lib/usecases/GetUserUseCase";

/**
 * The session check a handler starts with. It answers the three things every route needs — `401`
 * without a session, `403` without a profile row, and otherwise the caller's id, role and token.
 *
 * Moved here from `app/api/organizations/_lib` by SCRUM-59, because the facilities, branches,
 * schedules and revenue handlers need the same answers and a private folder per resource would mean
 * five copies (the AGENTS recipe asks for one shared implementation, see `app/api/branches/_lib`).
 */
export type CallerContext =
  | { ok: true; userId: string; role: string; profile: User; accessToken: string }
  | { ok: false; response: NextResponse };

export async function requireCaller(): Promise<CallerContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      ),
    };
  }

  const profile = await new GetUserUseCase(new SupabaseUserRepository()).execute(
    user.id,
  );

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: new MissingUserProfileError().message },
        { status: 403 },
      ),
    };
  }

  // The raw access token is forwarded to the `staff-account` Edge Function (SCRUM-52), which
  // authorizes the *user* rather than this app — that is why no shared secret lives here.
  const { data: sessionData } = await supabase.auth.getSession();

  return {
    ok: true,
    userId: user.id,
    role: profile.role,
    profile,
    accessToken: sessionData.session?.access_token ?? "",
  };
}

/**
 * `requireCaller()` plus the role gate (SCRUM-59): `403` when the caller's role does not hold
 * `capability` (`lib/accessPolicy.ts`, the same table `proxy.ts`, the sidebar and the pages read).
 *
 * This is the first of three layers, not the only one: the use case repeats the rule for the caller
 * it was given, and RLS (`is_organization_manager()` / `is_organization_owner()`) is what actually
 * decides which rows exist. The guard exists so a request the role may never make answers `403` with
 * a sentence instead of surfacing a policy that silently matched no row as a `500`.
 */
export async function requireCapability(
  capability: Capability,
): Promise<CallerContext> {
  const caller = await requireCaller();

  if (!caller.ok) {
    return caller;
  }

  if (!can(caller.role, capability)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your role may not perform this action." },
        { status: 403 },
      ),
    };
  }

  return caller;
}
