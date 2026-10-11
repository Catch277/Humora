import type {
  EmployeeStatus,
  EmployeeStatusFilters,
  EmployeeStatusValue,
} from "@/lib/domain/entities/EmployeeStatus";
import type { IEmployeeStatusRepository } from "@/lib/domain/repositories/IEmployeeStatusRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * Row shape as the RPC returns it. Declared locally because the client has no generated Database
 * type; `integer` columns can arrive as strings.
 */
type EmployeeStatusRow = {
  work_date: string;
  employee_id: string;
  full_name: string;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  status: string;
  shift_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_m: number | string | null;
  attendance_radius: number | string | null;
};

function optionalNumber(value: number | string | null): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toEmployeeStatus(row: EmployeeStatusRow): EmployeeStatus {
  return {
    work_date: row.work_date,
    employee_id: row.employee_id,
    full_name: row.full_name,
    role: row.role,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    // The CASE in SCRUM-22 only produces the values of the union.
    status: row.status as EmployeeStatusValue,
    shift_name: row.shift_name,
    check_in_at: row.check_in_at,
    check_out_at: row.check_out_at,
    check_in_distance_m: optionalNumber(row.check_in_distance_m),
    attendance_radius: optionalNumber(row.attendance_radius),
  };
}

export class SupabaseEmployeeStatusRepository
  implements IEmployeeStatusRepository
{
  async findAll(filters: EmployeeStatusFilters): Promise<EmployeeStatus[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_employee_status", {
      p_branch_id: filters.branchId ?? null,
      p_work_date: filters.workDate ?? null,
    });

    if (error) {
      throw new Error(`Unable to load employee status: ${error.message}`);
    }

    // The RPC returns a table, which PostgREST types as a generic row, so the cast goes through
    // `unknown` and is normalised by `toEmployeeStatus` instead.
    return ((data ?? []) as unknown as EmployeeStatusRow[]).map(toEmployeeStatus);
  }
}