"use client";

import {
  Building2,
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch, viewerFromRole } from "@/lib/domain/branchScope";
import { isEmployeeRole, isManagerRole } from "@/lib/domain/roles";
import {
  SHIFT_ASSIGNMENT_STATUSES,
  type Shift,
  type ShiftAssignment,
  type ShiftAssignmentStatus,
} from "@/lib/domain/entities/Shift";
import { normalizeForSearch } from "@/lib/searchText";

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

/**
 * A row of the staff directory (`GET /api/users`, SCRUM-24). The endpoint is a manager view, which is
 * the PII decision for this screen: the picker browses that directory once and filters locally, so a
 * name is no longer typed into a search box per keystroke. `is_active` is what keeps the people who
 * have quit out of the schedule (SCRUM-24 sets it to false when an account leaves).
 */
type StaffOption = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  /** SCRUM-63: the branch the employee works at — what scopes the picker for a manager. */
  branch_id: string | null;
};

type ScheduleForm = {
  employeeId: string;
  branchId: string;
  shiftId: string;
  workDate: string;
  status: ShiftAssignmentStatus;
  note: string;
};

type ModalState =
  | { mode: "create"; workDate: string }
  | { mode: "edit"; assignment: ShiftAssignment }
  | null;

type LoadResult = {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  branches: Branch[];
  error: string | null;
};

const STATUS_LABELS: Record<ShiftAssignmentStatus, string> = {
  SCHEDULED: "Đi làm",
  LEAVE: "Nghỉ phép",
  CANCELLED: "Đã huỷ",
};

const STATUS_BADGES: Record<ShiftAssignmentStatus, string> = {
  SCHEDULED: "bg-emerald-50 text-emerald-700",
  LEAVE: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

/**
 * The tinted block one assignment is drawn as inside a week-table cell — the `STATUS_BADGES` palette
 * used as a surface, so the pill and the block it sits in never disagree.
 */
const STATUS_SURFACES: Record<ShiftAssignmentStatus, string> = {
  SCHEDULED: "border-emerald-200/70 bg-emerald-50/60",
  LEAVE: "border-blue-200/70 bg-blue-50/60",
  CANCELLED: "border-slate-200 bg-slate-100/60",
};

const WEEKDAYS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];

const ALL = "all";

/** The picker renders at most this many rows; typing narrows the list further. */
const EMPLOYEE_RESULT_LIMIT = 50;

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500";

/** Business day in Asia/Bangkok (UTC+7, no DST); `en-CA` formats as YYYY-MM-DD. */
function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(),
  );
}

/** Calendar arithmetic on the date string — never on a local `Date`, so no timezone shifts it. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` (the schedule is read Monday → Sunday). */
function startOfWeek(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = (weekday + 6) % 7;

  return addDays(date, -offset);
}

function formatDay(date: string): string {
  const [, month, day] = date.split("-");

  return `${day}/${month}`;
}

function formatWeekRange(weekStart: string): string {
  return `${formatDay(weekStart)} – ${formatDay(addDays(weekStart, 6))}`;
}

function weekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  // getUTCDay(): 0 = Sunday, so Monday (index 0 of WEEKDAYS) is (weekday + 6) % 7.
  return WEEKDAYS[(weekday + 6) % 7];
}

function formatHours(time: string | null): string {
  return time ? time.slice(0, 5) : "--:--";
}

/**
 * A zero-length template is a day off, not a time of day: SCRUM-58 seeds "Nghỉ" as 00:00–00:00, and a
 * template without hours cannot be placed on a clock either.
 */
function isDayOffTemplate(shift: Shift): boolean {
  const start = shift.start_time ? shift.start_time.slice(0, 5) : null;
  const end = shift.end_time ? shift.end_time.slice(0, 5) : null;

  return start === null || end === null || start === end;
}

/**
 * Chronological order of the ca catalogue — what the picker and the week table both read.
 *
 * `GET /api/shifts` answers `name asc` ("Ca chiều" before "Ca sáng") for every consumer, and PostgREST
 * cannot express "zero-length last", so ordering belongs to the screens that show it: a real ca by its
 * `start_time`, the day off ("Nghỉ") after every ca, ties by name in Vietnamese order.
 */
function compareShiftsByStartTime(first: Shift, second: Shift): number {
  const firstIsDayOff = isDayOffTemplate(first);
  const secondIsDayOff = isDayOffTemplate(second);

  if (firstIsDayOff !== secondIsDayOff) {
    return firstIsDayOff ? 1 : -1;
  }

  const startComparison = formatHours(first.start_time).localeCompare(
    formatHours(second.start_time),
  );

  return startComparison !== 0
    ? startComparison
    : first.name.localeCompare(second.name, "vi");
}

/** Two-letter avatar for the schedule rows; falls back to "--" for a hidden profile. */
function initials(fullName: string | undefined): string {
  if (!fullName) {
    return "--";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function SchedulesPage() {
  // SCRUM-59/61: every role may open the schedule (`schedule:view`), but writing one is a manager
  // action — and only for the branch they head. An employee sees the plan without the controls, and a
  // manager sees another branch's shifts without "Sửa / Xoá".
  const { profile, can } = useProfile();
  // SCRUM-61: the screen and the use cases must answer "who manages which branch" the same way, so
  // this is exactly the `BranchViewer` the API builds (`viewerFromRole`) and not a capability standing
  // in for the `OWNER` role — deriving it from `branch:manage` meant the schedule silently fell into
  // the branch-scoped path whenever that one capability was missing or the profile had not loaded.
  const viewer = viewerFromRole(profile?.role, profile?.id ?? null);
  const viewerId = viewer.userId;
  const managesAllBranches = viewer.managesAllBranches;
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayInBangkok()));
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<ShiftAssignmentStatus | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ScheduleForm>({
    employeeId: "",
    branchId: "",
    shiftId: "",
    workDate: "",
    status: "SCHEDULED",
    note: "",
  });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const employeePickerRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  /**
   * SCRUM-63: `users.branch_id` is the branch a ca belongs to, and only the organization's OWNER may
   * set it. An owner who picks an employee nobody has assigned yet would otherwise be sent away from
   * the schedule to `/staff` and back — a dead end on this screen that the owner cannot resolve
   * anywhere else, and the most common reason "Xếp ca" refuses right after an organization is set up.
   */
  const [assignBranchId, setAssignBranchId] = useState("");
  const [assigningBranch, setAssigningBranch] = useState(false);
  const [assignError, setAssignError] = useState("");

  // The employee picker browses the SCRUM-24 staff directory, so it needs `is_active` — the quick
  // search endpoint does not carry it. A 403 is a normal outcome (SCRUM-59 `directory:view`), and in
  // that case the picker explains itself instead of showing an error banner: only a manager can write
  // a shift anyway, which the RLS policies on `shift_assignments` enforce.
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffAllowed, setStaffAllowed] = useState(false);

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead
  // of a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  const weekEnd = addDays(weekStart, 6);
  /**
   * Business "today" (Asia/Bangkok) resolved once per render, so the tinted column and its "Hôm nay"
   * marker cannot disagree if the clock crosses midnight between two lookups.
   */
  const today = todayInBangkok();

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // The catalogue fills the shift picker; the branch list names the rows.
      const [scheduleResponse, shiftsResponse, branchesResponse] =
        await Promise.all([
          fetch(`/api/schedules?start_date=${weekStart}&end_date=${weekEnd}`, {
            cache: "no-store",
          }),
          fetch("/api/shifts", { cache: "no-store" }),
          fetch("/api/branches", { cache: "no-store" }),
        ]);

      if (!scheduleResponse.ok) {
        const data = (await scheduleResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          assignments: [],
          shifts: [],
          branches: [],
          error: data?.error ?? "Không thể tải lịch làm việc.",
        };
      }

      // A failed catalogue request used to look like "this organization has no shift templates"; say
      // which it is, because the picker would otherwise be silently empty.
      const shiftsFailed = !shiftsResponse.ok;
      // Same reasoning for the branch list, and it bites harder: `manageableIds` is built from it, so
      // an unreadable list hides every Sửa/Xoá button and blocks "Xếp ca" in the modal — the screen
      // looks like a permission problem instead of a failed request.
      const branchesFailed = !branchesResponse.ok;

      return {
        assignments: (await scheduleResponse.json()) as ShiftAssignment[],
        shifts: shiftsFailed ? [] : ((await shiftsResponse.json()) as Shift[]),
        branches: branchesFailed
          ? []
          : ((await branchesResponse.json()) as Branch[]),
        error: shiftsFailed
          ? "Không thể tải danh mục ca làm việc."
          : branchesFailed
            ? "Không thể tải danh sách chi nhánh, nên chưa xếp ca được. Vui lòng tải lại."
            : null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setAssignments(result.assignments);
        setShifts(result.shifts);
        setBranches(result.branches);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAssignments([]);
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd, reloadToken]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users", { cache: "no-store" })
      .then(async (response): Promise<StaffOption[]> => {
        if (!response.ok) {
          // 403 for a role without the directory: the picker says so, the page stays usable.
          return [];
        }

        return (await response.json()) as StaffOption[];
      })
      .then((directory) => {
        if (cancelled) {
          return;
        }

        setStaff(directory);
        setStaffAllowed(directory.length > 0);
        setStaffLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setStaff([]);
        setStaffAllowed(false);
        setStaffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Clicking outside closes the picker. A blur handler is deliberately avoided: it also fires while
  // the pointer is on its way to a row inside the list.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (
        employeePickerRef.current &&
        !employeePickerRef.current.contains(event.target as Node)
      ) {
        setEmployeeDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);

    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => map.set(branch.id, branch.name));

    return map;
  }, [branches]);

  /**
   * SCRUM-63: the schedule works inside the branches the caller runs — every branch for the
   * organization's OWNER, and only the branches they head for a MANAGER. The API still lets a manager
   * *read* the whole organization (SCRUM-60), so this is the screen saying which part of it the
   * schedule tab is about; `manageableIds` derives from it so the pickers and the week table cannot disagree.
   */
  const scopedBranches = useMemo(
    () =>
      branches.filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      ),
    [branches, viewerId, managesAllBranches],
  );

  const manageableIds = useMemo(
    () => new Set(scopedBranches.map((branch) => branch.id)),
    [scopedBranches],
  );

  /**
   * Only the people who still work here can be scheduled: a deactivated account is "đã nghỉ" and has
   * no business in a new shift. Somebody deactivated *after* being scheduled keeps their row — and the
   * marker below — because that assignment still has to be editable.
   *
   * SCRUM-63 narrows the list further: a ca is covered by an `EMPLOYEE`, so a manager and the owner are
   * never offered (they run the operation instead of covering a shift), and a manager only schedules the
   * people of the branches they head — an employee whose `users.branch_id` is elsewhere, or still null,
   * belongs to somebody else's branch. The owner sees every employee of the organization.
   */
  const assignableStaff = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.is_active &&
          isEmployeeRole(member.role) &&
          (managesAllBranches ||
            (member.branch_id !== null && manageableIds.has(member.branch_id))),
      ),
    [staff, managesAllBranches, manageableIds],
  );

  const employeeMatches = useMemo(() => {
    const keyword = normalizeForSearch(employeeQuery.trim());

    if (!keyword) {
      return assignableStaff;
    }

    return assignableStaff.filter((member) =>
      normalizeForSearch(member.full_name).includes(keyword),
    );
  }, [assignableStaff, employeeQuery]);

  /** null while the directory is unknown (loading, or not readable by this account). */
  const selectedEmployeeIsActive =
    staff.find((member) => member.id === form.employeeId)?.is_active ?? null;

  /**
   * Whether the tab is scoped *by branch*: true only for a `MANAGER`, whose scope is
   * `branches.manager_id`. The organization's owner works across every branch, and an `EMPLOYEE` has no
   * branch scope at all.
   */
  const scopesByBranch = isManagerRole(profile?.role) && !managesAllBranches;

  /**
   * A manager's schedule is their own branches' schedule: rows of another branch stay out of the week table
   * *and* out of the counters below, so a KPI never promises a number the list does not show. The owner
   * keeps the whole organization.
   *
   * An `EMPLOYEE` keeps everything the API returned for them: RLS already narrowed `GET /api/schedules`
   * to their own rows (SCRUM-60/63), and they head no branch — filtering by "branches I manage" would
   * hide the very ca they are about to work, which is why this screen used to be blank for them.
   */
  const visibleAssignments = useMemo(
    () =>
      scopesByBranch
        ? assignments.filter((assignment) =>
            manageableIds.has(assignment.branch_id),
          )
        : assignments,
    [assignments, scopesByBranch, manageableIds],
  );

  /**
   * The branches the filter offers: the caller's own scope when they have one, otherwise the branches
   * they can read — for an employee that is the branch they work at (SCRUM-63), never one whose rows
   * would stay hidden.
   */
  const filterBranches = scopesByBranch ? scopedBranches : branches;

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return visibleAssignments.filter((assignment) => {
      if (branchFilter !== ALL && assignment.branch_id !== branchFilter) {
        return false;
      }

      if (statusFilter !== ALL && assignment.status !== statusFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (assignment.employee?.full_name ?? "")
        .toLowerCase()
        .includes(keyword);
    });
  }, [visibleAssignments, branchFilter, statusFilter, query]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  /**
   * The rows of the week table: every ca of the organization, earliest first, the day off last.
   *
   * The catalogue is not the whole truth — a template deleted since the ca was written, or a failed
   * `GET /api/shifts`, would drop a row that still holds assignments — so the embedded copy on the row
   * keeps it visible instead of hiding work.
   */
  const shiftRows = useMemo(() => {
    const byId = new Map<string, Shift>();

    shifts.forEach((shift) => byId.set(shift.id, shift));

    visibleAssignments.forEach((assignment) => {
      if (assignment.shift && !byId.has(assignment.shift.id)) {
        byId.set(assignment.shift.id, assignment.shift);
      }
    });

    return Array.from(byId.values()).sort(compareShiftsByStartTime);
  }, [shifts, visibleAssignments]);

  /** One cell per ca × day, keyed by `shiftId|workDate`; the blocks in a cell read in name order. */
  const cellsByShiftAndDay = useMemo(() => {
    const grouped = new Map<string, ShiftAssignment[]>();

    filtered.forEach((assignment) => {
      const key = `${assignment.shift_id}|${assignment.work_date}`;
      const bucket = grouped.get(key);

      if (bucket) {
        bucket.push(assignment);
      } else {
        grouped.set(key, [assignment]);
      }
    });

    grouped.forEach((bucket) =>
      bucket.sort((first, second) =>
        (first.employee?.full_name ?? "").localeCompare(
          second.employee?.full_name ?? "",
          "vi",
        ),
      ),
    );

    return grouped;
  }, [filtered]);

  /** The per-day counter the day sections used to carry, kept beside the weekday it describes. */
  const countByDay = useMemo(() => {
    const counts = new Map<string, number>();

    weekDays.forEach((day) => counts.set(day, 0));

    filtered.forEach((assignment) =>
      counts.set(
        assignment.work_date,
        (counts.get(assignment.work_date) ?? 0) + 1,
      ),
    );

    return counts;
  }, [filtered, weekDays]);

  /**
   * `is_active` lives in the directory (SCRUM-24) and is the only way to recognise a ca that predates a
   * resignation: the assignment stays editable and is marked with the same "(đã nghỉ)" as the modal.
   * An unreadable directory marks nobody instead of guessing.
   */
  const inactiveEmployeeIds = useMemo(
    () =>
      new Set(
        staff.filter((member) => !member.is_active).map((member) => member.id),
      ),
    [staff],
  );

  const scheduledCount = visibleAssignments.filter(
    (assignment) => assignment.status === "SCHEDULED",
  ).length;
  const leaveCount = visibleAssignments.filter(
    (assignment) => assignment.status === "LEAVE",
  ).length;
  const employeeCount = new Set(
    visibleAssignments.map((assignment) => assignment.employee_id),
  ).size;
  const branchCount = new Set(
    visibleAssignments.map((assignment) => assignment.branch_id),
  ).size;
  const isCurrentWeek = weekStart === startOfWeek(todayInBangkok());

  function openCreate(workDate: string) {
    // SCRUM-63: the branch is not picked here any more — it is where the chosen employee works, set by
    // `selectEmployee` below. Picking the branch first would let somebody schedule a person into a
    // branch that is not theirs, which the API (`assertBranchManagedBy`) refuses anyway.
    setForm({
      employeeId: "",
      branchId: "",
      shiftId: "",
      workDate,
      status: "SCHEDULED",
      note: "",
    });
    setEmployeeName("");
    setEmployeeQuery("");
    setEmployeeDropdownOpen(false);
    setFormError("");
    setAssignBranchId("");
    setAssignError("");
    setModal({ mode: "create", workDate });
  }

  function openEdit(assignment: ShiftAssignment) {
    setForm({
      employeeId: assignment.employee_id,
      branchId: assignment.branch_id,
      shiftId: assignment.shift_id,
      workDate: assignment.work_date,
      status: assignment.status,
      note: assignment.note ?? "",
    });
    setEmployeeName(assignment.employee?.full_name ?? "Nhân viên đã xoá");
    setEmployeeQuery("");
    setEmployeeDropdownOpen(false);
    setFormError("");
    setAssignBranchId("");
    setAssignError("");
    setModal({ mode: "edit", assignment });
  }

  function closeModal() {
    setModal(null);
    setEmployeeDropdownOpen(false);
    setFormError("");
    setAssignBranchId("");
    setAssignError("");
  }

  /**
   * Picks one directory row and closes the list; the name is kept for the collapsed state.
   *
   * SCRUM-63: the branch follows the employee — `users.branch_id` is where they work — so it is set
   * here and shown read-only in the modal. When the branch actually changes, a branch-specific shift
   * template no longer applies, so the chosen ca is cleared rather than silently kept.
   */
  function selectEmployee(member: StaffOption) {
    setForm((value) => {
      const branchId = member.branch_id ?? "";

      return {
        ...value,
        employeeId: member.id,
        branchId,
        shiftId: branchId === value.branchId ? value.shiftId : "",
      };
    });
    setEmployeeName(member.full_name);
    setEmployeeQuery("");
    setEmployeeDropdownOpen(false);
    setFormError("");
    // A new employee means a new branch question: forget the previous answer.
    setAssignBranchId(member.branch_id ?? "");
    setAssignError("");
  }

  /**
   * Gives the chosen employee the branch they are about to be scheduled into (SCRUM-63).
   *
   * The write is the same `PATCH /api/users/{id}` the staff screen sends — owner-only, and it must
   * carry the account's current `role`/`is_active` because that endpoint replaces the whole record.
   * The screen keeps its own copy of the directory up to date so a second ca for the same person does
   * not ask again.
   */
  async function assignBranchToSelectedEmployee() {
    const member = staff.find((row) => row.id === form.employeeId);

    if (!member || !assignBranchId) {
      return;
    }

    setAssigningBranch(true);
    setAssignError("");
    setFormError("");

    try {
      const response = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: member.role,
          is_active: member.is_active,
          branch_id: assignBranchId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setAssignError(data?.error ?? "Không gán được chi nhánh. Vui lòng thử lại.");
        return;
      }

      setStaff((current) =>
        current.map((row) =>
          row.id === member.id ? { ...row, branch_id: assignBranchId } : row,
        ),
      );

      // The ca now belongs to a branch, so the template list changes with it: a ca chosen while the
      // employee had no branch cannot be kept (`selectEmployee` clears it for the same reason).
      setForm((value) => ({
        ...value,
        branchId: assignBranchId,
        shiftId: value.branchId === assignBranchId ? value.shiftId : "",
      }));
    } catch {
      setAssignError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setAssigningBranch(false);
    }
  }

  async function submit() {
    if (!form.employeeId) {
      setFormError("Vui lòng chọn nhân viên được xếp ca.");
      return;
    }

    if (!form.branchId) {
      setFormError(
        "Nhân viên này chưa được gán chi nhánh. Vui lòng gán chi nhánh ở trang Quản lý nhân sự trước khi xếp ca.",
      );
      return;
    }

    if (!form.shiftId) {
      setFormError("Vui lòng chọn ca làm việc.");
      return;
    }

    if (!form.workDate) {
      setFormError("Vui lòng chọn ngày làm việc.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const isEdit = modal?.mode === "edit";
      const response = await fetch(
        isEdit ? `/api/schedules/${modal.assignment.id}` : "/api/schedules",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: form.employeeId,
            branch_id: form.branchId,
            shift_id: form.shiftId,
            work_date: form.workDate,
            status: form.status,
            note: form.note.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setFormError(
            "Nhân viên đã có ca trùng giờ trong ngày này. Chọn ca hoặc ngày khác.",
          );
          return;
        }

        if (response.status === 404) {
          setFormError("Không tìm thấy ca làm việc đã chọn. Tải lại trang và thử lại.");
          return;
        }

        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(data?.error ?? "Không thể lưu ca làm việc.");
        return;
      }

      closeModal();
      refresh();
    } catch {
      setFormError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(assignment: ShiftAssignment) {
    const employeeLabel = assignment.employee?.full_name ?? "nhân viên này";

    if (
      !window.confirm(
        `Xoá ca "${assignment.shift?.name ?? "?"}" của ${employeeLabel} ngày ${formatDay(assignment.work_date)}?`,
      )
    ) {
      return;
    }

    setDeletingId(assignment.id);
    setPageError("");

    try {
      const response = await fetch(`/api/schedules/${assignment.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(data?.error ?? "Không thể xoá ca làm việc.");
        return;
      }

      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setDeletingId("");
    }
  }

  // SCRUM-63: the branch belongs to the chosen employee, so before one is chosen (`branchId === ""`) there
  // is nothing to match a template against — not even the organization-wide ones with `branch_id = null`.
  const selectableShifts =
    form.branchId === ""
      ? []
      : shifts
          .filter(
            (shift) =>
              shift.branch_id === null || shift.branch_id === form.branchId,
          )
          .sort(compareShiftsByStartTime);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Vận hành ca / SCRUM-30
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Lịch làm việc
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Phân ca theo tuần cho từng chi nhánh, kiểm tra trùng giờ và theo dõi ngày nghỉ
            phép.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Tuần trước"
            className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700">
            Tuần {formatWeekRange(weekStart)}
            {isCurrentWeek && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Tuần này
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Tuần sau"
            className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight size={14} />
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(todayInBangkok()))}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Về tuần này
            </button>
          )}
          {can("schedule:manage") && (
            <button
              type="button"
              onClick={() => openCreate(isCurrentWeek ? todayInBangkok() : weekStart)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
            >
              <UserPlus size={14} /> Xếp ca
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Ca đã xếp trong tuần
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <CalendarRange size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {scheduledCount}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Không tính ngày nghỉ và ca đã huỷ
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Nhân viên được xếp
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {employeeCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            Có ít nhất một ca trong tuần
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-sky-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Ngày nghỉ phép
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <CalendarOff size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {leaveCount}
          </p>
          <p className="mt-1 text-[10px] text-sky-600">
            Đã ghi nhận trong lịch tuần
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-teal-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Chi nhánh có lịch
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Building2 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {branchCount}
          </p>
          <p className="mt-1 text-[10px] text-teal-600">
            Trên tổng số {branches.length} chi nhánh
          </p>
        </article>
      </div>

      {pageError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs xl:w-96">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              aria-label="Tìm nhân viên trong lịch"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên nhân viên"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>

          <select
            aria-label="Lọc theo chi nhánh"
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
          >
            <option value={ALL}>Tất cả chi nhánh</option>
            {filterBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={() => setStatusFilter(ALL)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              statusFilter === ALL
                ? "bg-blue-50 text-primary"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Tất cả trạng thái
          </button>
          {SHIFT_ASSIGNMENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                statusFilter === status
                  ? STATUS_BADGES[status]
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          <p className="ml-auto text-[10px] text-slate-400">
            {filtered.length} ca trong tuần {formatWeekRange(weekStart)}
          </p>
        </div>

        {loading && (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin text-primary" />
            Đang tải lịch làm việc...
          </p>
        )}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed border-collapse text-left text-xs">
              <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-36 px-4 py-3">Ca làm việc</th>
                  {weekDays.map((day) => (
                    <th
                      key={day}
                      className={`border-l border-slate-200/70 px-3 py-3 ${
                        day === today ? "bg-blue-50/60 text-primary" : ""
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        {weekdayLabel(day)} · {formatDay(day)}
                        <span
                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500"
                          title={`${countByDay.get(day) ?? 0} ca trong ngày`}
                        >
                          {countByDay.get(day) ?? 0}
                        </span>
                        {day === today && (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            Hôm nay
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/*
                  The catalogue is what makes a row exist, so an organization whose templates were never
                  seeded reads *why* the week is flat instead of facing an empty frame — the same hint
                  the "Ca làm việc" picker below shows.
                */}
                {shiftRows.length === 0 && (
                  <tr className="border-t border-slate-100">
                    <td
                      colSpan={weekDays.length + 1}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      Hệ thống chưa có ca làm việc nào. Quản trị viên cần nạp danh mục ca
                      (supabase/sql/SCRUM-58_shift_catalogue.sql) trước khi xếp ca.
                    </td>
                  </tr>
                )}

                {shiftRows.map((shift) => (
                  <tr
                    key={shift.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <th
                      scope="row"
                      className="bg-app px-4 py-3 text-left align-top"
                    >
                      <p className="text-[11px] font-semibold text-slate-800">
                        {shift.name}
                      </p>
                      <p className="mt-0.5 text-[10px] font-normal tabular-nums text-slate-500">
                        {isDayOffTemplate(shift)
                          ? "Ngày nghỉ"
                          : `${formatHours(shift.start_time)} – ${formatHours(shift.end_time)}`}
                      </p>
                      {/* A template only some branches use (SCRUM-30 sets `branch_id`) — name it. */}
                      {shift.branch_id !== null && (
                        <p className="mt-0.5 text-[10px] font-normal text-slate-400">
                          {branchNames.get(shift.branch_id) ?? "Chi nhánh đã xoá"}
                        </p>
                      )}
                    </th>

                    {weekDays.map((day) => (
                      <td
                        key={day}
                        className="group border-l border-slate-100 px-2 py-2 align-top transition-colors hover:bg-slate-50/70"
                      >
                        <div className="space-y-1.5">
                          {(
                            cellsByShiftAndDay.get(`${shift.id}|${day}`) ?? []
                          ).map((assignment) => (
                            <div
                              key={assignment.id}
                              className={`rounded-lg border px-2.5 py-2 ${
                                STATUS_SURFACES[assignment.status]
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[9px] font-bold text-primary">
                                  {initials(assignment.employee?.full_name)}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-slate-900">
                                    {assignment.employee?.full_name ??
                                      "Nhân viên đã xoá"}
                                    {inactiveEmployeeIds.has(
                                      assignment.employee_id,
                                    ) && (
                                      <span className="ml-1 font-normal text-amber-600">
                                        (đã nghỉ)
                                      </span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                    {branchNames.get(assignment.branch_id) ??
                                      "Chi nhánh đã xoá"}
                                  </p>
                                </div>

                                {can("schedule:manage") &&
                                  manageableIds.has(assignment.branch_id) && (
                                    <div className="flex shrink-0 items-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openEdit(assignment)}
                                        title="Sửa ca"
                                        aria-label={`Sửa ca của ${
                                          assignment.employee?.full_name ??
                                          "nhân viên này"
                                        }`}
                                        className="rounded p-0.5 text-slate-400 transition-colors hover:bg-surface hover:text-primary"
                                      >
                                        <Pencil size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void remove(assignment)}
                                        disabled={deletingId === assignment.id}
                                        title="Xoá ca"
                                        aria-label={`Xoá ca của ${
                                          assignment.employee?.full_name ??
                                          "nhân viên này"
                                        }`}
                                        className="rounded p-0.5 text-slate-400 transition-colors hover:bg-surface hover:text-rose-600 disabled:opacity-50"
                                      >
                                        {deletingId === assignment.id ? (
                                          <Loader2
                                            size={11}
                                            className="animate-spin"
                                          />
                                        ) : (
                                          <Trash2 size={11} />
                                        )}
                                      </button>
                                    </div>
                                  )}
                              </div>

                              {assignment.status !== "SCHEDULED" && (
                                <span
                                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    STATUS_BADGES[assignment.status]
                                  }`}
                                >
                                  {STATUS_LABELS[assignment.status]}
                                </span>
                              )}

                              {assignment.note && (
                                <p
                                  className="mt-0.5 truncate text-[10px] text-slate-500"
                                  title={assignment.note}
                                >
                                  {assignment.note}
                                </p>
                              )}
                            </div>
                          ))}

                          {/*
                            The old per-day "Thêm ca" moved into the cell: it is the only spot that knows
                            both the day and the ca being added. Revealed on hover so the week stays a
                            table, and reachable by keyboard through `focus-visible`.
                          */}
                          {can("schedule:manage") && (
                            <button
                              type="button"
                              onClick={() => openCreate(day)}
                              aria-label={`Thêm ca ${shift.name} ngày ${formatDay(day)}`}
                              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-1.5 text-[10px] font-semibold text-slate-400 opacity-0 transition-opacity hover:border-primary hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Plus size={11} /> Thêm
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <CalendarRange size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {modal.mode === "create" ? "Xếp ca làm việc" : "Cập nhật ca"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Một nhân viên có thể có nhiều ca trong ngày, miễn là không trùng giờ.
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeModal}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600">
                  Nhân viên <span className="text-rose-500">*</span>
                </p>

                {form.employeeId ? (
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-app px-3 py-2.5">
                    <span className="text-sm font-normal text-slate-700">
                      {employeeName}
                      {selectedEmployeeIsActive === false && (
                        <span className="ml-1 text-[11px] font-semibold text-amber-600">
                          (đã nghỉ)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((value) => ({ ...value, employeeId: "" }));
                        setEmployeeName("");
                        // The list opens straight away: replacing the person is the only reason this
                        // button exists.
                        setEmployeeDropdownOpen(true);
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Đổi nhân viên
                    </button>
                  </div>
                ) : (
                  <div ref={employeePickerRef} className="relative mt-1">
                    <input
                      value={employeeQuery}
                      onChange={(event) => {
                        setEmployeeQuery(event.target.value);
                        setEmployeeDropdownOpen(true);
                      }}
                      onFocus={() => setEmployeeDropdownOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEmployeeDropdownOpen(false);
                          return;
                        }

                        if (event.key === "Enter" && employeeMatches.length > 0) {
                          event.preventDefault();
                          selectEmployee(employeeMatches[0]);
                        }
                      }}
                      placeholder="Bấm để xem danh sách, hoặc gõ tên để lọc"
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
                    />

                    {employeeDropdownOpen && (
                      <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-surface shadow-lg">
                        {staffLoading && (
                          <li className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
                            <Loader2 size={13} className="animate-spin" />
                            Đang tải danh sách nhân sự...
                          </li>
                        )}

                        {!staffLoading && !staffAllowed && (
                          <li className="px-3 py-2 text-xs text-slate-500">
                            Chỉ chủ sở hữu/quản lý mới xem được danh sách nhân sự.
                          </li>
                        )}

                        {!staffLoading &&
                          staffAllowed &&
                          employeeMatches.length === 0 && (
                            <li className="px-3 py-2 text-xs text-slate-500">
                              Không có nhân viên nào phù hợp — chỉ nhân viên đang làm việc mới
                              xếp ca được.
                            </li>
                          )}

                        {employeeMatches
                          .slice(0, EMPLOYEE_RESULT_LIMIT)
                          .map((member) => (
                            <li key={member.id}>
                              <button
                                type="button"
                                onClick={() => selectEmployee(member)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50"
                              >
                                <span className="font-medium text-slate-800">
                                  {member.full_name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {/* Only employees are listed, so their branch is the useful fact. */}
                                  {member.branch_id
                                    ? (branchNames.get(member.branch_id) ?? "")
                                    : "Chưa gán chi nhánh"}
                                </span>
                              </button>
                            </li>
                          ))}

                        {employeeMatches.length > EMPLOYEE_RESULT_LIMIT && (
                          <li className="px-3 py-2 text-[10px] text-slate-400">
                            Còn {employeeMatches.length - EMPLOYEE_RESULT_LIMIT} người
                            nữa — gõ thêm để thu hẹp danh sách.
                          </li>
                        )}
                      </ul>
                    )}

                    <span className="mt-1 block text-[11px] text-slate-400">
                      {managesAllBranches
                        ? "Danh sách chỉ gồm tài khoản nhân viên đang làm việc; quản lý, chủ sở hữu và tài khoản đã nghỉ không xếp ca được. Chi nhánh lấy theo nhân viên được chọn."
                        : "Danh sách chỉ gồm nhân viên đang làm việc thuộc chi nhánh bạn phụ trách; quản lý, chủ sở hữu và tài khoản đã nghỉ không xếp ca được. Chi nhánh lấy theo nhân viên được chọn."}
                    </span>
                  </div>
                )}
              </div>

              {/*
                Full width instead of the two-column grid this field used to share with the owner-only
                "Gán chi nhánh" pack below: that grid rendered it half-width and stretched it to the height
                of that pack.
              */}
              <div className="min-w-0">
                <label className="block text-xs font-semibold text-slate-600">
                  Chi nhánh <span className="text-rose-500">*</span>
                  {/* SCRUM-63: the branch is where the chosen employee works, never a free choice, so
                      this is a statement instead of a picker — the API refuses any other branch. */}
                  <span className="mt-1 block rounded-lg border border-slate-200 bg-app px-3 py-2.5 text-sm font-normal text-slate-600">
                    {form.branchId
                      ? (branchNames.get(form.branchId) ?? "—")
                      : form.employeeId
                        ? "Nhân viên chưa được gán chi nhánh"
                        : "Chọn nhân viên để xác định chi nhánh"}
                  </span>
                  {/* Under the box, not inside it: a two-line box read as a taller field than the
                      "Ca làm việc" select right below it. */}
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    Chi nhánh lấy theo nhân viên được chọn
                  </span>
                  {manageableIds.size === 0 ? (
                    <span className="mt-1 block text-[11px] font-normal text-amber-600">
                      {managesAllBranches
                        ? "Chưa đọc được danh sách chi nhánh nên chưa xếp ca được — xem băng báo lỗi phía trên rồi tải lại."
                        : "Bạn chưa phụ trách chi nhánh nào nên chưa xếp ca được — nhờ chủ sở hữu gán bạn làm chi nhánh trưởng ở trang Quản lý chi nhánh."}
                    </span>
                  ) : (
                    form.employeeId &&
                    !form.branchId &&
                    !can("staff:manage") && (
                      <span className="mt-1 block text-[11px] font-normal text-amber-600">
                        Nhân viên này chưa được gán chi nhánh — gán ở trang Quản lý nhân sự trước khi
                        xếp ca.
                      </span>
                    )
                  )}
                </label>

                {/*
                  SCRUM-63: the owner is the only role that may set `users.branch_id`, so the one person
                  who can resolve "nhân viên chưa có chi nhánh" is offered the action here instead of
                  being sent to `/staff` and back. Deliberately outside the `<label>` above: a label
                  forwards a click to its first form control, and this block is a picker plus a button.
                */}
                {manageableIds.size > 0 &&
                  form.employeeId &&
                  !form.branchId &&
                  can("staff:manage") && (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-[11px] font-normal text-amber-600">
                        Nhân viên này chưa được gán chi nhánh. Chọn chi nhánh rồi gán để xếp ca được
                        ngay.
                      </p>
                      <div className="flex items-center gap-2">
                        <select
                          value={assignBranchId}
                          onChange={(event) => setAssignBranchId(event.target.value)}
                          className={inputClassName}
                          aria-label="Chi nhánh gán cho nhân viên"
                        >
                          <option value="">Chọn chi nhánh</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void assignBranchToSelectedEmployee()}
                          disabled={!assignBranchId || assigningBranch}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {assigningBranch ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Building2 size={13} />
                          )}
                          Gán chi nhánh
                        </button>
                      </div>
                      {assignError && (
                        <p className="text-[11px] font-normal text-rose-600">
                          {assignError}
                        </p>
                      )}
                    </div>
                  )}

                <label className="block text-xs font-semibold text-slate-600">
                  Ca làm việc <span className="text-rose-500">*</span>
                  <select
                    value={form.shiftId}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        shiftId: event.target.value,
                      }))
                    }
                    disabled={selectableShifts.length === 0}
                    className={inputClassName}
                  >
                    <option value="">Chọn ca</option>
                    {selectableShifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} ({formatHours(shift.start_time)} –{" "}
                        {formatHours(shift.end_time)})
                      </option>
                    ))}
                  </select>
                  {/*
                    An empty picker used to be silent. The catalogue is per organization (SCRUM-53),
                    so an organization whose templates were never seeded has nothing to choose from —
                    say so rather than letting the operator guess.
                  */}
                  {shifts.length === 0 ? (
                    <span className="mt-1 block text-[11px] font-normal text-amber-600">
                      Hệ thống chưa có ca làm việc nào. Quản trị viên cần nạp danh mục ca
                      (supabase/sql/SCRUM-58_shift_catalogue.sql) trước khi xếp ca.
                    </span>
                  ) : form.branchId !== "" && selectableShifts.length === 0 ? (
                    <span className="mt-1 block text-[11px] font-normal text-amber-600">
                      Chi nhánh này chưa có ca làm việc — mọi ca hiện có đều gắn với
                      chi nhánh khác.
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Ngày làm việc <span className="text-rose-500">*</span>
                  <input
                    type="date"
                    value={form.workDate}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        workDate: event.target.value,
                      }))
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-600">
                  Trạng thái
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        status: event.target.value as ShiftAssignmentStatus,
                      }))
                    }
                    className={inputClassName}
                  >
                    {SHIFT_ASSIGNMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Ghi chú
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, note: event.target.value }))
                  }
                  maxLength={500}
                  rows={2}
                  placeholder="Ví dụ: hỗ trợ ca khai trương, đổi ca với chị Ngọc"
                  className={`${inputClassName} resize-none`}
                />
              </label>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {formError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={
                  saving || !form.employeeId || !manageableIds.has(form.branchId)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Đang lưu..." : "Lưu ca làm việc"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
