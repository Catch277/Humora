import type {
  Facility,
  FacilityCondition,
  FacilityRecordInput,
} from "@/lib/domain/entities/Facility";
import { FacilityCategoryNotFoundError } from "@/lib/domain/errors/FacilityCategoryNotFoundError";
import { FacilityCodeConflictError } from "@/lib/domain/errors/FacilityCodeConflictError";
import { FacilityNotFoundError } from "@/lib/domain/errors/FacilityNotFoundError";
import type { IFacilityRepository } from "@/lib/domain/repositories/IFacilityRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const FACILITY_COLUMNS =
  "id, branch_id, name, code, category, quantity, condition, last_checked_at, note, created_at, updated_at";

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type; an integer column can still arrive as a string.
 */
type FacilityRow = {
  id: string;
  branch_id: string;
  name: string;
  code: string | null;
  category: string;
  quantity: number | string;
  condition: string;
  last_checked_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    branch_id: row.branch_id,
    name: row.name,
    code: row.code,
    // `category` is a plain text column the `facilities_category_fkey` foreign key constrains to the
    // organization's catalogue (SCRUM-65), so no cast can add anything here.
    category: row.category,
    quantity: Number(row.quantity),
    // The `facilities_condition_check` in SCRUM-45 keeps this one inside the union.
    condition: row.condition as FacilityCondition,
    last_checked_at: row.last_checked_at,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * `23503` on a facility write is the `facilities_category_fkey` (SCRUM-65): the category names a code that
 * is not in the caller's catalogue. Answering `400` with a sentence beats a bare `500` for a stale screen
 * — or for a project where `SCRUM-65_facility_categories.sql` has not been applied yet.
 */
function throwIfCategoryUnknown(error: { code?: string }): void {
  if (error.code === "23503") {
    throw new FacilityCategoryNotFoundError();
  }
}

/**
 * `23505` naming SCRUM-66's index is one asset code claimed twice. Since SCRUM-67 the code is always
 * generated — the request carries none — so this is a race: two saves that read the same highest number
 * before either wrote it. The message names the index (PostgREST reports the constraint it violated)
 * because a plain `23505` on this table would otherwise be indistinguishable from a future unique column.
 */
const ASSET_CODE_UNIQUE_INDEX = "facilities_organization_code_key";

function throwIfCodeTaken(error: { code?: string; message?: string }): void {
  if (
    error.code === "23505" &&
    (error.message ?? "").includes(ASSET_CODE_UNIQUE_INDEX)
  ) {
    throw new FacilityCodeConflictError();
  }
}

export class SupabaseFacilityRepository implements IFacilityRepository {
  async findAll(branchId?: string): Promise<Facility[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("facilities")
      .select(FACILITY_COLUMNS)
      .order("name", { ascending: true });

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load facilities: ${error.message}`);
    }

    return ((data ?? []) as FacilityRow[]).map(toFacility);
  }

  async findById(id: string): Promise<Facility | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facilities")
      .select(FACILITY_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the facility: ${error.message}`);
    }

    // RLS scopes the read (SCRUM-60: managers of the organization), so a hidden row is "no facility".
    return data ? toFacility(data as FacilityRow) : null;
  }

  async listCodes(): Promise<string[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facilities")
      .select("code")
      .not("code", "is", null);

    if (error) {
      throw new Error(`Unable to load facility codes: ${error.message}`);
    }

    // The column is nullable in the table, so the row type has to say so even though the filter above
    // removes the null rows.
    return ((data ?? []) as { code: string | null }[])
      .map((row) => row.code)
      .filter((code): code is string => code !== null);
  }

  async create(input: FacilityRecordInput): Promise<Facility> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facilities")
      .insert({
        branch_id: input.branchId,
        name: input.name,
        code: input.code,
        category: input.category,
        quantity: input.quantity,
        condition: input.condition,
        last_checked_at: input.lastCheckedAt,
        note: input.note,
      })
      .select(FACILITY_COLUMNS)
      .single();

    if (error) {
      throwIfCategoryUnknown(error);
      throwIfCodeTaken(error);
      throw new Error(`Unable to create facility: ${error.message}`);
    }

    return toFacility(data as FacilityRow);
  }

  async update(id: string, input: FacilityRecordInput): Promise<Facility> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facilities")
      .update({
        branch_id: input.branchId,
        name: input.name,
        code: input.code,
        category: input.category,
        quantity: input.quantity,
        condition: input.condition,
        last_checked_at: input.lastCheckedAt,
        note: input.note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(FACILITY_COLUMNS)
      .maybeSingle();

    if (error) {
      throwIfCategoryUnknown(error);
      throwIfCodeTaken(error);
      throw new Error(`Unable to update facility: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a
    // forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new FacilityNotFoundError();
    }

    return toFacility(data as FacilityRow);
  }

  async delete(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facilities")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to delete facility: ${error.message}`);
    }

    if (!data) {
      throw new FacilityNotFoundError();
    }
  }
}
