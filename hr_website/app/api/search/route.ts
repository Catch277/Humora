/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search users, requests, and shifts
 *     description: Searches only data accessible to the authenticated user under the active Supabase RLS policies.
 *     tags:
 *       - Search
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Keyword to search for.
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, users, requests, shifts]
 *           default: all
 *         description: Limits the result to one resource type.
 *     responses:
 *       200:
 *         description: Grouped quick-search results.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuickSearchResult'
 *       400:
 *         description: The search query or type is invalid.
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The authenticated account has no eligible user profile.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { type NextRequest, NextResponse } from "next/server";

import type { QuickSearchType } from "@/lib/domain/entities/QuickSearch";
import { QuickSearchForbiddenError } from "@/lib/domain/errors/QuickSearchForbiddenError";
import { SupabaseQuickSearchRepository } from "@/lib/infrastructure/repositories/SupabaseQuickSearchRepository";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { GetUserUseCase } from "@/lib/usecases/GetUserUseCase";
import { QuickSearchUseCase } from "@/lib/usecases/QuickSearchUseCase";

const SEARCH_TYPES = new Set<QuickSearchType>([
  "all",
  "users",
  "requests",
  "shifts",
]);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const type = request.nextUrl.searchParams.get("type") ?? "all";

  if (
    query.trim().length < 2 ||
    !SEARCH_TYPES.has(type as QuickSearchType)
  ) {
    return NextResponse.json(
      { error: "q must contain at least 2 characters and type is invalid." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const currentUser = await new GetUserUseCase(
      new SupabaseUserRepository(),
    ).execute(user.id);

    if (!currentUser) {
      return NextResponse.json(
        { error: "An eligible user profile is required." },
        { status: 403 },
      );
    }

    const quickSearch = new QuickSearchUseCase(
      new SupabaseQuickSearchRepository(),
    );
    const results = await quickSearch.execute({
      query,
      type: type as QuickSearchType,
      currentUser,
    });

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof QuickSearchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message.startsWith("q must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to perform quick search", error);
    return NextResponse.json(
      { error: "Unable to perform quick search." },
      { status: 500 },
    );
  }
}
