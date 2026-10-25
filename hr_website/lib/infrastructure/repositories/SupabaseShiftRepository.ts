import type { Shift } from "@/lib/domain/entities/Shift";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const SHIFT_COLUMNS = "id, name, branch_id, start_time, end_time";
/** SCRUM-85 adds `is_active`; the catalogue read asks for it and falls back when the column is absent. */
const SHIFT_COLUMNS_WITH_ACTIVE = `${SHIFT_COLUMNS}, is_active`;

/**
 * The template `SCRUM-85_retire_ca_toi.sql` retires: `Ca tối` 14:00–23:00.
 *
 * It is named here **only** for the pre-migration fallback in `findAll` below. A project that has not run
 * that script has no `is_active` column, so every template would read as active: `/schedules` would keep
 * the row (it is still meant to be retired) and, because this ca overlaps both `Ca chiều` and `Tăng ca`,
 * the derived 17:30–18:00 pause could not be drawn either. Once the column exists the flag is the only
 * input and this constant is never consulted — no other code in the app classifies a template by name.
 */
const PRE_MIGRATION_RETIRED_SHIFT_NAME = "Ca tối";

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type; `time` columns arrive as `HH:MM:SS` strings and may be null.
 *
 * `is_active` is optional because two different reads produce this shape: the catalogue read below
 * (which selects it, or retries without it on a project that has not run SCRUM-85) and the embeds in
 * `shift_assignments` / `requests` (which select the columns a screen renders, not the flag).
 */
export type ShiftRow = {
  id: string;
  name: string;
  branch_id: string | null;
  start_time: string | null;
  end_time: string | null;
  is_active?: boolean;
};

export function toShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    name: row.name,
    branch_id: row.branch_id,
    start_time: row.start_time,
    end_time: row.end_time,
    // Absent = the column does not exist yet (or the embed did not ask for it): the row is active.
    is_active: row.is_active ?? true,
  };
}

export class SupabaseShiftRepository implements IShiftRepository {
  async findAll(): Promise<Shift[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shifts")
      .select(SHIFT_COLUMNS_WITH_ACTIVE)
      .order("name", { ascending: true });

    if (!error) {
      return ((data ?? []) as ShiftRow[]).map(toShift);
    }

    // `42703` is PostgREST's "column does not exist": the project has not run
    // SCRUM-85_retire_ca_toi.sql yet. Retrying without the flag keeps the whole timetable working instead of
    // failing every `/schedules` load — the same fallback `SupabaseBranchRepository.withAssetPrefixColumn()`
    // uses for SCRUM-67. The legacy `Ca tối` is then marked inactive by name, so the screen already behaves
    // the way the script will make permanent (see `PRE_MIGRATION_RETIRED_SHIFT_NAME`).
    if (error.code !== "42703") {
      throw new Error(`Unable to load shifts: ${error.message}`);
    }

    const fallback = await supabase
      .from("shifts")
      .select(SHIFT_COLUMNS)
      .order("name", { ascending: true });

    if (fallback.error) {
      throw new Error(`Unable to load shifts: ${fallback.error.message}`);
    }

    return ((fallback.data ?? []) as ShiftRow[]).map((row) => ({
      ...toShift(row),
      is_active: row.name !== PRE_MIGRATION_RETIRED_SHIFT_NAME,
    }));
  }

  /**
   * A lookup has to keep finding a *retired* template: a legacy assignment still points at `Ca tối`, and
   * `UpdateShiftAssignmentUseCase` re-reads it before saving that row. The flag is therefore not selected
   * here — the catalogue list above is the only reader that filters on it.
   */
  async findById(id: string): Promise<Shift | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shifts")
      .select(SHIFT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load shift: ${error.message}`);
    }

    return data ? toShift(data as ShiftRow) : null;
  }
}
