import type {
  CreateRequestInput,
  RequestEntity,
  RequestFilters,
  ReviewRequestInput,
} from "@/lib/domain/entities/RequestEntity";
import { RequestApprovalConflictError } from "@/lib/domain/errors/RequestApprovalConflictError";
import { RequestNotFoundError } from "@/lib/domain/errors/RequestNotFoundError";
import { RequestShiftDetailsError } from "@/lib/domain/errors/RequestShiftDetailsError";
import type { IRequestRepository } from "@/lib/domain/repositories/IRequestRepository";
import {
  toShift,
  type ShiftRow,
} from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `requester` is an embedded resource resolved from the `user_id` foreign key
 * (`requests_user_id_fkey`, ensured by SCRUM-41), so the approval queue shows names without a
 * staff-list endpoint.
 *
 * `shift` and `target_employee` are the two SCRUM-82 embeds: the ca a "Đổi ca" đơn hands over and the
 * colleague who takes it. `target_employee` names its foreign key because a request now points at
 * `users` three times (`user_id`, `approver_id`, `target_employee_id`) and PostgREST refuses to guess
 * which one an unqualified `users` embed means (PGRST201). `shifts` is reachable once, so it does not
 * have to.
 */
const REQUEST_COLUMNS = [
  "id",
  "branch_id",
  "user_id",
  "request_type",
  "title",
  "content",
  "work_date",
  "shift_id",
  "target_employee_id",
  "status",
  "reject_reason",
  "approver_id",
  "created_at",
  "updated_at",
  // The foreign key is named explicitly: a request points at `users` twice (the requester and
  // the approver), so an unqualified `users` embed is ambiguous (PGRST201).
  "requester:users!requests_user_id_fkey (id, full_name)",
  "shift:shifts (id, name, branch_id, start_time, end_time)",
  "target_employee:users!requests_target_employee_id_fkey (id, full_name)",
].join(", ");

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type, and a to-one embedding normally arrives as an object but falls back to an
 * array when PostgREST cannot prove the cardinality.
 */
type EmbeddedRow<T> = T | T[] | null;

type RequestRow = {
  id: string;
  branch_id: string;
  user_id: string;
  request_type: string;
  title: string | null;
  content: string | null;
  work_date: string | null;
  shift_id: string | null;
  target_employee_id: string | null;
  status: string;
  reject_reason: string | null;
  approver_id: string | null;
  created_at: string;
  updated_at: string;
  requester: EmbeddedRow<{ id: string; full_name: string }>;
  shift: EmbeddedRow<ShiftRow>;
  target_employee: EmbeddedRow<{ id: string; full_name: string }>;
};

function firstOf<T>(value: EmbeddedRow<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toRequestEntity(row: RequestRow): RequestEntity {
  const requester = firstOf(row.requester);
  const shift = firstOf(row.shift);
  const targetEmployee = firstOf(row.target_employee);

  return {
    id: row.id,
    branch_id: row.branch_id,
    user_id: row.user_id,
    request_type: row.request_type,
    title: row.title,
    content: row.content,
    work_date: row.work_date,
    shift_id: row.shift_id,
    target_employee_id: row.target_employee_id,
    status: row.status,
    reject_reason: row.reject_reason,
    approver_id: row.approver_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    requester: requester
      ? { id: requester.id, full_name: requester.full_name }
      : null,
    // A hidden related row (RLS) comes back as null instead of failing the query.
    shift: shift ? toShift(shift) : null,
    target_employee: targetEmployee
      ? { id: targetEmployee.id, full_name: targetEmployee.full_name }
      : null,
  };
}

export class SupabaseRequestRepository implements IRequestRepository {
  async findFiltered(filters: RequestFilters): Promise<RequestEntity[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("requests")
      .select(REQUEST_COLUMNS)
      .order("updated_at", { ascending: false });

    if (filters.branchId) {
      query = query.eq("branch_id", filters.branchId);
    }

    if (filters.requestType) {
      query = query.eq("request_type", filters.requestType);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load requests: ${error.message}`);
    }

    // The embedded resource makes PostgREST's inferred row type unusable, so the cast goes
    // through `unknown` and is normalised by `toRequestEntity` instead.
    return ((data ?? []) as unknown as RequestRow[]).map(toRequestEntity);
  }

  async findById(id: string): Promise<RequestEntity | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requests")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the request: ${error.message}`);
    }

    // RLS scopes the read (SCRUM-60: own rows, or a manager), so a hidden row is simply "no request".
    return data ? toRequestEntity(data as unknown as RequestRow) : null;
  }

  async create(
    input: CreateRequestInput & { userId: string },
  ): Promise<RequestEntity> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requests")
      .insert({
        branch_id: input.branchId,
        user_id: input.userId,
        request_type: input.requestType,
        title: input.title,
        content: input.content,
        // The day the đơn is about and, for a "Đổi ca" đơn, the ca and the colleague who takes it
        // (SCRUM-82). The three are null for the types that do not use them; the route has already
        // refused a ca-dependent type without them and `requests_guard_shift_details` (SCRUM-83)
        // refuses it again in the database.
        work_date: input.workDate,
        shift_id: input.shiftId,
        target_employee_id: input.targetEmployeeId,
        // `requests_insert_own` (SCRUM-53) only accepts the caller's own row *and* this exact status,
        // so the status is written here rather than left to the column default — a tampered body can
        // never file an already-approved request.
        status: "PENDING",
      })
      // `organization_id` is not sent: its column default is `current_organization_id()`, which is
      // the same predicate the insert policy checks.
      .select(REQUEST_COLUMNS)
      .single();

    if (error) {
      // The INSERT guard (SCRUM-83) answers the caller's own mistake: a day that is missing or already
      // past, or a "Đổi ca" đơn without its ca and colleague. The route checks the same rules first, so
      // this covers what that check cannot see — a body written by another client.
      if (error.code === "23P03" || error.code === "23P05") {
        throw new RequestShiftDetailsError(error.message);
      }

      // The partial unique index on (user_id, work_date, shift_id) for live swap đơn: the same ca cannot
      // be promised to two colleagues at once (SCRUM-82). The 23505 code is also the fallback for any
      // other unique index on this table, which is why the sentence says "đơn".
      if (error.code === "23505") {
        throw new RequestShiftDetailsError(
          "Bạn đã có một đơn đổi ca đang chờ duyệt cho đúng ca và ngày này.",
        );
      }

      throw new Error(`Unable to create request: ${error.message}`);
    }

    return toRequestEntity(data as unknown as RequestRow);
  }

  async review(id: string, input: ReviewRequestInput): Promise<RequestEntity> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requests")
      .update({
        status: input.status,
        reject_reason: input.status === "REJECTED" ? input.rejectReason : null,
        approver_id: input.approverId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(REQUEST_COLUMNS)
      .maybeSingle();

    if (error) {
      // `requests_apply_approved_effects` (SCRUM-83) applies the decision in the same statement, and
      // refuses it when the schedule moved while the đơn waited: the ca is no longer the requester's, the
      // ca has already ended, somebody clocked in for it, the colleague left the branch, or the colleague
      // is busy. Nothing is stored — the đơn stays `PENDING` — and the trigger's Vietnamese sentence is
      // what the manager reads, so it is passed through.
      if (error.code === "23P04") {
        throw new RequestApprovalConflictError(error.message);
      }

      throw new Error(`Unable to review request: ${error.message}`);
    }

    // RLS hides rows the caller may not review, so "no row" covers both a wrong id and a
    // forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new RequestNotFoundError();
    }

    return toRequestEntity(data as unknown as RequestRow);
  }
}

