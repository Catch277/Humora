import type {
  Branch,
  BranchDependents,
  CreateBranchInput,
  UpdateBranchInput,
} from "@/lib/domain/entities/Branch";
import { BranchAssetPrefixConflictError } from "@/lib/domain/errors/BranchAssetPrefixConflictError";
import { BranchManagerChangeForbiddenError } from "@/lib/domain/errors/BranchManagerChangeForbiddenError";
import { BranchNotEmptyError } from "@/lib/domain/errors/BranchNotEmptyError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const BRANCH_COLUMNS =
  "id, name, asset_prefix, address, manager_id, latitude, longitude, attendance_radius, created_at, updated_at";

/**
 * The same list without `asset_prefix`, for a database where `SCRUM-67_branch_asset_prefix.sql` has not
 * been applied yet — see `withAssetPrefixColumn()`.
 */
const BRANCH_COLUMNS_WITHOUT_ASSET_PREFIX =
  "id, name, address, manager_id, latitude, longitude, attendance_radius, created_at, updated_at";

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type; `numeric`/`double precision` columns can arrive as strings.
 */
type BranchRow = {
  id: string;
  name: string;
  /** Absent on a database where SCRUM-67 has not been applied yet — see `withAssetPrefixColumn()`. */
  asset_prefix?: number | string | null;
  address: string | null;
  manager_id: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  attendance_radius: number | string;
  created_at: string;
  updated_at: string;
};

function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    asset_prefix:
      row.asset_prefix === null || row.asset_prefix === undefined
        ? null
        : Number(row.asset_prefix),
    address: row.address,
    manager_id: row.manager_id,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    attendance_radius: Number(row.attendance_radius),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * `23505` naming SCRUM-67's index is a branch number that was claimed between the read and the insert.
 * The message names the index — PostgREST reports the constraint it violated — so a future unique column
 * on `branches` is not mistaken for this one.
 */
const ASSET_PREFIX_UNIQUE_INDEX = "branches_organization_asset_prefix_key";

function isAssetPrefixConflict(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" &&
    (error.message ?? "").includes(ASSET_PREFIX_UNIQUE_INDEX)
  );
}

/**
 * PostgREST answers `42703` ("column ... does not exist") when a statement names a column the table has
 * not got. For `asset_prefix` that means `SCRUM-67_branch_asset_prefix.sql` has not been applied yet.
 */
function isAssetPrefixColumnMissing(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42703" && (error.message ?? "").includes("asset_prefix")
  );
}

/**
 * Logged on every request that takes the compatibility path instead of once per process, so an operator
 * working on a database that is missing the script keeps seeing what to run.
 */
function warnAssetPrefixColumnMissing(): void {
  console.warn(
    "branches.asset_prefix is missing: apply supabase/sql/SCRUM-67_branch_asset_prefix.sql. Until then " +
      "asset codes fall back to the bare acronym (SVH-0001 style) and /branches shows \"chưa có số thứ tự\".",
  );
}

/** What a branch statement returns, as far as this file cares; `data` is normalised by the call site. */
type BranchStatement = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Runs one branch statement with `asset_prefix`, and repeats it without the column when the table has not
 * got it yet (SCRUM-67 not applied).
 *
 * This is the one column a branch read may skip: nothing but the prefix of a *generated* asset code and the
 * number shown on `/branches` depends on it, so the alternative — a `500` on `GET /api/branches` — would
 * take down every screen that lists branches (revenue, schedules, staff, attendance, facilities). Skipping
 * it degrades to the SCRUM-66 behaviour, and the product says so: every row reads "chưa có số thứ tự" and
 * the branch modal tells the owner to run the script. The retry costs nothing once the column exists — the
 * first attempt is the ordinary statement, and only `42703` repeats it (a statement that failed names no
 * column, so a write is never half-applied before the repeat).
 */
async function withAssetPrefixColumn(
  run: (options: {
    withNumber: boolean;
    columns: string;
  }) => PromiseLike<BranchStatement>,
): Promise<BranchStatement> {
  const attempt = await run({ withNumber: true, columns: BRANCH_COLUMNS });

  if (attempt.error && isAssetPrefixColumnMissing(attempt.error)) {
    warnAssetPrefixColumnMissing();

    return run({
      withNumber: false,
      columns: BRANCH_COLUMNS_WITHOUT_ASSET_PREFIX,
    });
  }

  return attempt;
}

export class SupabaseBranchRepository implements IBranchRepository {
  async findAll(): Promise<Branch[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await withAssetPrefixColumn(({ columns }) =>
      supabase
        .from("branches")
        .select(columns)
        // Creation order, oldest first: the list then reads like the numbers the branches were given
        // (01, 02, …), which is what the owner sees next to each name. `name` only breaks a tie between
        // two branches created in the same second. Ordering by `asset_prefix` would be tempting but it
        // would break the compatibility path above — that column does not exist on a database where
        // SCRUM-67 has not been applied, and `created_at` is in both column lists.
        .order("created_at", { ascending: true })
        .order("name", { ascending: true }),
    );

    if (error) {
      throw new Error(`Unable to load branches: ${error.message}`);
    }

    return ((data ?? []) as BranchRow[]).map(toBranch);
  }

  async findById(id: string): Promise<Branch | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await withAssetPrefixColumn(({ columns }) =>
      supabase.from("branches").select(columns).eq("id", id).maybeSingle(),
    );

    if (error) {
      throw new Error(`Unable to load the branch: ${error.message}`);
    }

    // RLS scopes the read to the caller's organization, so "no row" also covers another tenant's id.
    return data ? toBranch(data as BranchRow) : null;
  }

  async create(input: CreateBranchInput): Promise<Branch> {
    const supabase = await createSupabaseServerClient();

    // SCRUM-67: the branch number is `max(asset_prefix) + 1` over the branches this session can read (the
    // creator is the organization's owner, so that is all of them), and
    // `branches_organization_asset_prefix_key` is the boundary. Two attempts, because the only way to lose
    // is another branch saved in the same instant — which is a retry, not a failure — and a typed error for
    // the second loss so the route answers `409` instead of a bare `500`.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: highest, error: highestError } = await supabase
        .from("branches")
        .select("asset_prefix")
        .order("asset_prefix", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      // A missing column (SCRUM-67 not applied yet) is not an error here: the insert below drops the
      // column too, and the script's backfill numbers the branch the moment it runs.
      if (highestError && !isAssetPrefixColumnMissing(highestError)) {
        throw new Error(
          `Unable to read the branch numbers: ${highestError.message}`,
        );
      }

      // `null` when the number is unknown — no branch yet (the first number is 1), or no column at all.
      const assetPrefix = highestError
        ? null
        : Number(
            (highest as { asset_prefix: number | string | null } | null)
              ?.asset_prefix ?? 0,
          ) + 1;

      const { data, error } = await withAssetPrefixColumn(
        ({ withNumber, columns }) =>
          supabase
            .from("branches")
            .insert(
              withNumber
                ? {
                    name: input.name,
                    address: input.address,
                    manager_id: input.managerId,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    attendance_radius: input.attendanceRadius,
                    asset_prefix: assetPrefix,
                  }
                : {
                    name: input.name,
                    address: input.address,
                    manager_id: input.managerId,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    attendance_radius: input.attendanceRadius,
                  },
            )
            .select(columns)
            .single(),
      );

      if (!error) {
        return toBranch(data as BranchRow);
      }

      if (isAssetPrefixConflict(error)) {
        if (attempt === 0) {
          continue;
        }

        throw new BranchAssetPrefixConflictError();
      }

      throw new Error(`Unable to create branch: ${error.message}`);
    }

    // Unreachable: the loop returns on success and throws on every failure.
    throw new BranchAssetPrefixConflictError();
  }

  async update(id: string, input: UpdateBranchInput): Promise<Branch> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await withAssetPrefixColumn(({ columns }) =>
      supabase
        .from("branches")
        .update({
          name: input.name,
          address: input.address,
          manager_id: input.managerId,
          latitude: input.latitude,
          longitude: input.longitude,
          attendance_radius: input.attendanceRadius,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(columns)
        .maybeSingle(),
    );

    if (error) {
      // `branches_guard_manager_change` (SCRUM-61) refuses a non-owner moving `manager_id` or
      // `organization_id`. The use case checks both first, so this is the backstop for a write that
      // bypasses it — and a typed error keeps that answer a 403 instead of a 500.
      if (error.code === "P0001") {
        throw new BranchManagerChangeForbiddenError();
      }

      throw new Error(`Unable to update branch: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and
    // a forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new BranchNotFoundError();
    }

    return toBranch(data as BranchRow);
  }

  async countDependents(id: string): Promise<BranchDependents> {
    const supabase = await createSupabaseServerClient();

    // Four exact counts rather than four fetches: the numbers end up in the 409 sentence and the
    // tables are the biggest ones in the schema. `head: true` asks PostgREST for the count only.
    const [attendance, assignments, facilities, revenue] = await Promise.all([
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
      supabase
        .from("shift_assignments")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
      supabase
        .from("facilities")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
      supabase
        .from("daily_revenue")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id),
    ]);

    for (const response of [attendance, assignments, facilities, revenue]) {
      if (response.error) {
        throw new Error(
          `Unable to count the branch's data: ${response.error.message}`,
        );
      }
    }

    return {
      attendance: attendance.count ?? 0,
      assignments: assignments.count ?? 0,
      facilities: facilities.count ?? 0,
      revenue: revenue.count ?? 0,
    };
  }

  async delete(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("branches")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      // `branches_guard_delete` (SCRUM-61) repeats the emptiness rule for a write that bypasses the
      // use case. It carries the counts too, but parsing them out of a sentence would be brittle, so
      // the error travels without them and the message stays the generic half of the sentence.
      if (error.code === "P0001") {
        throw new BranchNotEmptyError();
      }

      throw new Error(`Unable to delete branch: ${error.message}`);
    }

    // RLS hides rows the caller may not delete, so "no row" covers both a wrong id and a forbidden
    // delete — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new BranchNotFoundError();
    }
  }
}
