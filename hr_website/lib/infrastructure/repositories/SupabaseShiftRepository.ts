import type { Shift } from "@/lib/domain/entities/Shift";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const SHIFT_COLUMNS = "id, name, branch_id, start_time, end_time";

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type; `time` columns arrive as `HH:MM:SS` strings and may be null.
 */
export type ShiftRow = {
  id: string;
  name: string;
  branch_id: string | null;
  start_time: string | null;
  end_time: string | null;
};

export function toShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    name: row.name,
    branch_id: row.branch_id,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

export class SupabaseShiftRepository implements IShiftRepository {
  async findAll(): Promise<Shift[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shifts")
      .select(SHIFT_COLUMNS)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Unable to load shifts: ${error.message}`);
    }

    return ((data ?? []) as ShiftRow[]).map(toShift);
  }

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
