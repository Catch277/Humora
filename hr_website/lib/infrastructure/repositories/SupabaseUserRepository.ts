import type {
  StaffMember,
  UpdateStaffInput,
} from "@/lib/domain/entities/StaffMember";
import type { User } from "@/lib/domain/entities/User";
import { StaffNotFoundError } from "@/lib/domain/errors/StaffNotFoundError";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * The session profile deliberately excludes `is_active` (see StaffMember); it does carry the branch,
 * which SCRUM-63 needs in the shell (and means `SCRUM-63_employee_branch.sql` must be applied before
 * this build ships).
 */
const USER_COLUMNS = "id, full_name, role, branch_id";

const STAFF_COLUMNS = "id, full_name, role, is_active, created_at, branch_id";

type StaffRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  branch_id: string | null;
};

function toStaffMember(row: StaffRow): StaffMember {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at,
    branch_id: row.branch_id,
  };
}

export class SupabaseUserRepository implements IUserRepository {
  async getById(id: string): Promise<User | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load user: ${error.message}`);
    }

    return data;
  }

  async findAll(): Promise<StaffMember[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select(STAFF_COLUMNS)
      // Active accounts first, then by name, so the screen opens on the people who work here.
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true });

    if (error) {
      throw new Error(`Unable to load staff: ${error.message}`);
    }

    return ((data ?? []) as StaffRow[]).map(toStaffMember);
  }

  async update(id: string, input: UpdateStaffInput): Promise<StaffMember> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .update({
        role: input.role,
        is_active: input.isActive,
        // SCRUM-63: the branch an employee belongs to. `null` is a valid value — it means "chưa gán
        // chi nhánh", which is what keeps the account out of every branch-scoped read.
        branch_id: input.branchId ?? null,
      })
      .eq("id", id)
      .select(STAFF_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to update staff member: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a
    // forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new StaffNotFoundError();
    }

    return toStaffMember(data as StaffRow);
  }

  async completePasswordChange(): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("complete_password_change");

    if (error) {
      throw new Error(`Unable to complete the password change: ${error.message}`);
    }
  }
}
