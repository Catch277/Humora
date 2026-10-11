"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  UserX,
} from "lucide-react";

import { roleLabel } from "@/lib/accessPolicy";
import {
  APP_ROLES,
  isBranchHeadRole,
  isOwnerRole,
  type AppRole,
} from "@/lib/domain/roles";

type StaffMemberRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  /** SCRUM-63: the branch the account belongs to; `null` means "chưa gán chi nhánh". */
  branch_id: string | null;
};

type StaffDraft = {
  role: AppRole;
  isActive: boolean;
  /** `""` is the "Chưa gán chi nhánh" option; it travels to the API as `null` (SCRUM-63). */
  branchId: string;
};

/**
 * The branch picker's options (SCRUM-63): `id` + `name` for the select, `manager_id` for the
 * "Phụ trách" note a manager's row shows.
 */
type Branch = { id: string; name: string; manager_id: string | null };

const ROLE_SET: ReadonlySet<string> = new Set(APP_ROLES);

/**
 * Only an `EMPLOYEE` is attached to a branch (SCRUM-63). The owner stands above every branch, and a
 * manager's scope comes from `branches.manager_id` — `users.branch_id` is informational for them and
 * the screen deliberately offers no picker (SCRUM-60 lets them read the whole organization anyway).
 */
function holdsBranch(role: string): boolean {
  return role === "EMPLOYEE";
}

/** Mirrors the API contract: the role sent back must be one of the three known values. */
function toDraftRole(role: string): AppRole {
  const upper = role.trim().toUpperCase();

  return (ROLE_SET.has(upper) ? upper : "EMPLOYEE") as AppRole;
}

/**
 * One place turns a row into a draft, so the three call sites cannot drift (SCRUM-63).
 *
 * `branchId` always reads "" for a role the screen does not attach to a branch, which keeps a legacy
 * `branch_id` out of the payload on the next save (see `save`).
 */
function toDraft(member: StaffMemberRow): StaffDraft {
  return {
    role: toDraftRole(member.role),
    isActive: member.is_active,
    branchId: holdsBranch(toDraftRole(member.role))
      ? (member.branch_id ?? "")
      : "",
  };
}

/** The value `isDirty` compares a draft against, mirroring `toDraft`. */
function storedBranchId(member: StaffMemberRow): string {
  return holdsBranch(toDraftRole(member.role)) ? (member.branch_id ?? "") : "";
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

/**
 * The order the `/staff` table reads in (SCRUM-24): active accounts first, then the newest account,
 * then A→Z. The two first keys mirror what the owner does on this screen — hand out a branch to
 * somebody who still works here, and see the account that was just created at the top.
 *
 * `created_at` is an ISO timestamp, so it is compared through `createdAtValue` rather than as a string:
 * a row whose date is missing or hand-edited then sorts as the oldest instead of throwing the whole
 * list off (the server has already ordered by name, which is what the `full_name` tie-break restores).
 */
function compareStaffRows(first: StaffMemberRow, second: StaffMemberRow): number {
  if (first.is_active !== second.is_active) {
    return first.is_active ? -1 : 1;
  }

  const recency = createdAtValue(second) - createdAtValue(first);

  if (recency !== 0) {
    return recency;
  }

  return first.full_name.localeCompare(second.full_name, "vi");
}

/** `0` for a missing or unparseable `created_at`, which keeps such a row at the bottom of the list. */
function createdAtValue(member: StaffMemberRow): number {
  const parsed = new Date(member.created_at).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
}

function actionErrorMessage(status: number, data: { error?: string } | null): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 403) {
    return "Chỉ chủ sở hữu (OWNER) mới quản lý được nhân sự.";
  }

  if (status === 404) {
    return "Không tìm thấy tài khoản này.";
  }

  return data?.error ?? "Không thực hiện được thao tác. Vui lòng thử lại.";
}

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMemberRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [query, setQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<{
      members: StaffMemberRow[];
      branches: Branch[];
      error: string | null;
    }> {
      // The branch picker needs the list, and both reads belong to the owner (`staff:manage` and
      // `branch:view`), so they load together (SCRUM-63).
      const [usersResponse, branchesResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);

      if (!usersResponse.ok) {
        const data = (await usersResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          members: [],
          branches: [],
          error: actionErrorMessage(usersResponse.status, data),
        };
      }

      return {
        members: (await usersResponse.json()) as StaffMemberRow[],
        branches: branchesResponse.ok
          ? ((await branchesResponse.json()) as Branch[])
          : [],
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setMembers(result.members);
        setBranches(result.branches);
        setDrafts(
          Object.fromEntries(
            result.members.map((member) => [member.id, toDraft(member)]),
          ),
        );
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setMembers([]);
        setBranches([]);
        setDrafts({});
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  // Searching by branch is what the owner actually does once every account has one (SCRUM-63).
  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => map.set(branch.id, branch.name));

    return map;
  }, [branches]);

  // The branches a manager *heads* come from `branches.manager_id` — for them that is the scope that
  // matters, not `users.branch_id` (a manager reads the whole organization either way). One manager
  // may head several branches, so the map holds a list rather than a single name.
  const headedBranchNames = useMemo(() => {
    const map = new Map<string, string[]>();

    branches.forEach((branch) => {
      if (!branch.manager_id) {
        return;
      }

      map.set(branch.manager_id, [
        ...(map.get(branch.manager_id) ?? []),
        branch.name,
      ]);
    });

    return map;
  }, [branches]);

  /**
   * The rows the table shows: the search filter (name, role label or branch name), then the order this
   * screen reads in (SCRUM-24) —
   *
   *   1. whoever still works here (a departed account is history the owner scrolls past, not the first
   *      thing the screen shows),
   *   2. then the account created most recently,
   *   3. then A→Z, so two accounts created the same day keep a stable, readable order.
   *
   * `GET /api/users` answers name order because `/schedules` and `/branches` pick people from the same
   * directory and a picker wants A→Z, so how *this* table reads is decided here, not in the repository.
   */
  const filteredMembers = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const matching = keyword
      ? members.filter((member) =>
          `${
            member.full_name
          } ${roleLabel(member.role)} ${branchNames.get(member.branch_id ?? "") ?? ""}`
            .toLowerCase()
            .includes(keyword),
        )
      : members;

    // A copy: `members` is state, and `sort` reorders the array in place.
    return [...matching].sort(compareStaffRows);
  }, [members, query, branchNames]);

  const activeCount = members.filter((member) => member.is_active).length;

  function updateDraft(id: string, patch: Partial<StaffDraft>) {
    setDrafts((value) => {
      const current = value[id] ?? {
        role: "EMPLOYEE" as AppRole,
        isActive: true,
        branchId: "",
      };

      return { ...value, [id]: { ...current, ...patch } };
    });
  }

  /** A row shows a draft until it is saved, so the badge reflects what will be stored. */
  function draftOf(member: StaffMemberRow): StaffDraft {
    return drafts[member.id] ?? toDraft(member);
  }

  function isDirty(member: StaffMemberRow): boolean {
    const draft = draftOf(member);

    return (
      draft.role !== toDraftRole(member.role) ||
      draft.isActive !== member.is_active ||
      draft.branchId !== storedBranchId(member)
    );
  }

  async function save(member: StaffMemberRow) {
    const draft = draftOf(member);
    setSavingId(member.id);
    setPageError("");

    try {
      const payload: Record<string, unknown> = {
        role: draft.role,
        is_active: draft.isActive,
      };

      // Only an employee is attached to a branch (SCRUM-63): for the other roles the column is a
      // statement, so `branch_id` is **omitted** and the API keeps whatever the row already has —
      // the screen must not clear a value it does not show. `""` is the "Chưa gán chi nhánh" option
      // and travels as `null`, which the API reads as "tháo gán".
      if (holdsBranch(draft.role)) {
        payload.branch_id = draft.branchId || null;
      }

      const response = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data));
        return;
      }

      const updated = (await response.json()) as StaffMemberRow;
      setMembers((value) =>
        value.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setDrafts((value) => ({
        ...value,
        [updated.id]: toDraft(updated),
      }));
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Nhân sự / SCRUM-24 · SCRUM-63
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Quản lý nhân sự</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cấp vai trò, gán chi nhánh và cho nhân viên nghỉ việc — thay cho thao tác SQL thủ công
          trước đây.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Tổng tài khoản
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <Users size={16} />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{members.length}</p>
          <p className="mt-1 text-[10px] text-slate-500">Gồm cả tài khoản đã nghỉ việc</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Đang làm việc
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserRoundCheck size={16} />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{activeCount}</p>
          <p className="mt-1 text-[10px] text-emerald-600">
            Vẫn hiện trong bảng công và lịch làm việc
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Đã nghỉ việc
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <UserX size={16} />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {members.length - activeCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            Hiện là NGHỈ VIỆC ở trang trạng thái nhân viên
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            Tài khoản do nhân viên tự đăng ký, vai trò do bạn cấp
          </p>
          <p className="mt-1">
            Nhân viên tự tạo tài khoản ở trang Đăng ký; khi họ đăng nhập lần đầu, hãy đổi vai
            trò ở đây thành <span className="font-medium">Quản lý chi nhánh</span> nếu cần
            duyệt đơn. Chỉ <span className="font-medium">chủ sở hữu</span> mới cấp hoặc thu
            hồi vai trò chủ sở hữu, và không ai tự sửa được vai trò của mình.
          </p>
          <p className="mt-1">
            <span className="font-medium">Gán chi nhánh làm việc</span> ở cột &quot;Chi nhánh làm
            việc&quot;: chỉ nhân viên mới được gán chi nhánh, và khi chưa gán thì họ không thấy lịch
            làm việc, bảng công hay gửi được đơn nào. Quản lý làm việc theo chi nhánh mình phụ trách
            (gán ở trang Quản lý chi nhánh) nên cột này chỉ ghi lại chi nhánh đó, còn chủ sở hữu đứng
            trên mọi chi nhánh nên không gán vào chi nhánh nào.
          </p>
        </div>
      </div>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, vai trò hoặc chi nhánh"
              className="w-full text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Tải lại
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Đang tải danh sách nhân sự...
          </div>
        ) : filteredMembers.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            Chưa có tài khoản nào để hiển thị. Nhân viên tự đăng ký ở trang Đăng ký.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nhân viên</th>
                  <th className="px-4 py-3 font-semibold">Vai trò</th>
                  <th className="px-4 py-3 font-semibold">Chi nhánh làm việc</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Ngày tạo</th>
                  <th className="px-4 py-3 font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((member) => {
                  const draft = draftOf(member);
                  const dirty = isDirty(member);
                  // SCRUM-63: a manager may head more than one branch, so the cell lists them all.
                  const headedBranches = headedBranchNames.get(member.id) ?? [];

                  return (
                    <tr key={member.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">
                          {member.full_name || "Chưa đặt tên"}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {member.id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            updateDraft(member.id, {
                              role: event.target.value as AppRole,
                            })
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        >
                          {APP_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {isOwnerRole(member.role) ? (
                          // SCRUM-63: the owner stands above every branch, so there is nothing to
                          // assign — an empty select here would read as a missing setting.
                          <span className="block text-[11px] text-slate-400">
                            Không gán chi nhánh
                            <span className="mt-1 block max-w-44 text-[10px]">
                              Chủ sở hữu đứng trên mọi chi nhánh
                            </span>
                          </span>
                        ) : isBranchHeadRole(member.role) ? (
                          // A manager is not attached to a branch either: what matters for them is the
                          // chi nhánh they head, and they read the whole organization (SCRUM-60) — so the
                          // column is a statement, never a picker.
                          <span className="block max-w-56 text-[11px] text-slate-400">
                            {headedBranches.length > 0
                              ? `Phụ trách: ${headedBranches.join(", ")}`
                              : "Chưa phụ trách chi nhánh nào — vẫn xem được toàn tổ chức"}
                          </span>
                        ) : (
                          <>
                            <select
                              aria-label={`Chi nhánh làm việc của ${
                                member.full_name || "tài khoản"
                              }`}
                              value={draft.branchId}
                              onChange={(event) =>
                                updateDraft(member.id, {
                                  branchId: event.target.value,
                                })
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                            >
                              <option value="">Chưa gán chi nhánh</option>
                              {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                            {!draft.branchId && (
                              <p className="mt-1 max-w-40 text-[10px] text-amber-600">
                                Chưa gán: không thấy ca, bảng công hay gửi được đơn
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            draft.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {draft.isActive ? "Đang làm việc" : "Đã nghỉ việc"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(member.id, { isActive: !draft.isActive })
                          }
                          className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <RotateCcw size={12} />
                          {draft.isActive ? "Cho nghỉ việc" : "Kích hoạt lại"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatDateTime(member.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void save(member)}
                          disabled={!dirty || savingId === member.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                        >
                          {savingId === member.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Save size={13} />
                          )}
                          Lưu
                        </button>
                        {dirty && (
                          <p className="mt-1 text-[10px] text-amber-600">
                            Có thay đổi chưa lưu
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
