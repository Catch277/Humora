"use client";

import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch } from "@/lib/domain/branchScope";
import type { Attendance, AttendanceStatus } from "@/lib/domain/entities/Attendance";
import type { Branch } from "@/lib/domain/entities/Branch";
import type { Shift, ShiftAssignment } from "@/lib/domain/entities/Shift";
import { isManagerRole } from "@/lib/domain/roles";
import { isShiftStillRunning } from "@/lib/usecases/attendanceStatus";
import {
  effectiveCheckOut,
  effectiveWorkedHours,
} from "@/lib/usecases/attendanceAutoClose";

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type BranchOption = Pick<Branch, "id" | "name" | "manager_id">;

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

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

/** A stored timestamp as the clock reads in Vietnam; `--:--` while the ca is still open. */
function formatTime(value: string | null): string {
  if (!value) {
    return "--:--";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "--:--" : timeFormatter.format(parsed);
}

/** A `shifts.start_time` (`HH:MM:SS`) as a label; `--:--` when the template carries no hours. */
function formatShiftTime(value: string | null): string {
  if (!value) {
    return "--:--";
  }

  const match = /^(\d{1,2}):(\d{2})/.exec(value);

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "--:--";
}

/** `YYYY-MM-DD` → `DD/MM`, without going through `Date` so no timezone shifts the day. */
function formatDayDate(value: string): string {
  const [, month, day] = value.split("-");

  return `${day}/${month}`;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function weekdayShort(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return WEEKDAY_SHORT[weekday];
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: "Đúng giờ",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  ABSENT: "Vắng mặt",
  INCOMPLETE: "Thiếu giờ ra",
};

// The tones DESIGN.md §7.6 lists for the attendance statuses.
const STATUS_BADGES: Record<AttendanceStatus, string> = {
  ON_TIME: "bg-emerald-50 text-emerald-700",
  LATE: "bg-amber-50 text-amber-700",
  EARLY_LEAVE: "bg-orange-50 text-orange-700",
  ABSENT: "bg-rose-50 text-rose-700",
  INCOMPLETE: "bg-slate-100 text-slate-600",
};

type GeofenceVerdict = "INSIDE" | "OUTSIDE" | "UNKNOWN";

/**
 * The geofence verdict of SCRUM-22, read exactly as `/attendance` reads it: the distance is derived by
 * the database from the point that was sent, and the branch carries the allowed radius. A record without
 * a point (the device refused a location) cannot be judged.
 */
function geofenceVerdict(record: Attendance): GeofenceVerdict {
  if (record.check_in_distance_m === null || !record.branch) {
    return "UNKNOWN";
  }

  if (record.branch.latitude === null || record.branch.longitude === null) {
    return "UNKNOWN";
  }

  return record.check_in_distance_m <= record.branch.attendance_radius
    ? "INSIDE"
    : "OUTSIDE";
}

const GEOFENCE_LABELS: Record<GeofenceVerdict, string> = {
  INSIDE: "Trong vùng",
  OUTSIDE: "Ngoài vùng",
  UNKNOWN: "Thiếu toạ độ",
};

const GEOFENCE_BADGES: Record<GeofenceVerdict, string> = {
  INSIDE: "bg-emerald-50 text-emerald-700",
  OUTSIDE: "bg-rose-50 text-rose-700",
  UNKNOWN: "bg-slate-100 text-slate-600",
};

/** How many days of one's own history the screen shows. */
const HISTORY_DAYS = 30;

const primaryButtonClassName =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 bg-surface p-2.5 text-sm font-normal outline-none focus:border-blue-500";

type LoadResult = {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  branches: BranchOption[];
  records: Attendance[];
  error: string | null;
};

/**
 * Chấm công (SCRUM-68): the web counterpart of the mobile check-in, for the two roles that work a ca.
 *
 * The organization's `OWNER` never reaches this screen — `attendance:checkin` is not one of their
 * capabilities, so `proxy.ts` bounces the deep link and the sidebar shows no link at all.
 */
export default function CheckInPage() {
  const { profile, can } = useProfile();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "check-in" | "check-out">("");
  // A manager names the branch they clock in at (SCRUM-61) and may name a ca; an employee's branch and
  // ca come from the assignment instead, so neither picker is shown to them.
  const [branchChoice, setBranchChoice] = useState("");
  const [shiftChoice, setShiftChoice] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const viewerId = profile?.id ?? null;
  const isManager = isManagerRole(profile?.role);
  const managesAllBranches = can("branch:manage");
  const today = todayInBangkok();
  const historyStart = addDays(today, -(HISTORY_DAYS - 1));
  // Read once per render; the re-open window below is judged against the clock, exactly as the API does.
  const now = new Date();

  useEffect(() => {
    if (!viewerId) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // One attendance read covers both "hôm nay" and the 30-day history; the branch/ca lists only the
      // manager's pickers need, so an employee does not pay for them.
      const [recordsResponse, schedulesResponse, shiftsResponse, branchesResponse] =
        await Promise.all([
          fetch(
            `/api/attendance?employee_id=${viewerId}&start_date=${historyStart}&end_date=${today}`,
            { cache: "no-store" },
          ),
          isManager
            ? Promise.resolve(null)
            : fetch(
                `/api/schedules?employee_id=${viewerId}&start_date=${today}&end_date=${today}`,
                { cache: "no-store" },
              ),
          isManager
            ? fetch("/api/shifts", { cache: "no-store" })
            : Promise.resolve(null),
          isManager
            ? fetch("/api/branches", { cache: "no-store" })
            : Promise.resolve(null),
        ]);

      if (!recordsResponse.ok) {
        const data = (await recordsResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          assignments: [],
          shifts: [],
          branches: [],
          records: [],
          error: data?.error ?? "Không thể tải lịch sử chấm công của bạn.",
        };
      }

      // Today's plan is what an employee checks in against, so a failed schedule read is said out loud
      // instead of looking like "hôm nay bạn không có ca".
      const scheduleFailed = schedulesResponse !== null && !schedulesResponse.ok;

      return {
        assignments: schedulesResponse?.ok
          ? ((await schedulesResponse.json()) as ShiftAssignment[])
          : [],
        shifts: shiftsResponse?.ok ? ((await shiftsResponse.json()) as Shift[]) : [],
        branches: branchesResponse?.ok
          ? ((await branchesResponse.json()) as BranchOption[])
          : [],
        records: (await recordsResponse.json()) as Attendance[],
        error: scheduleFailed ? "Không thể tải ca làm việc hôm nay." : null,
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
        setRecords(result.records);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAssignments([]);
        setShifts([]);
        setBranches([]);
        setRecords([]);
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerId, isManager, historyStart, today, reloadToken]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  /**
   * SCRUM-63: the picker offers the branches the caller runs — every branch for an organization's owner
   * (who cannot be here) and only the ones a manager heads. The API refuses the rest anyway, so the
   * screen never offers a choice that must fail.
   */
  const scopedBranches = useMemo(
    () =>
      branches.filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      ),
    [branches, viewerId, managesAllBranches],
  );

  // Derived instead of stored, so the picker opens on the caller's own branch without an effect that
  // sets state — the first scoped branch is the first one they head.
  const selectedBranchId = branchChoice || scopedBranches[0]?.id || "";

  const todayRecords = useMemo(
    () => records.filter((record) => record.work_date === today),
    [records, today],
  );

  /** Today's ca an employee may check in against. */
  const todayAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "SCHEDULED"),
    [assignments],
  );

  /** The records a check-out can close: this morning's arrival, still without a giờ ra. */
  const openRecords = useMemo(
    () => todayRecords.filter((record) => record.check_in_at && !record.check_out_at),
    [todayRecords],
  );

  /**
   * The row a ca already produced today — `null` for the unscheduled row a manager creates when they pick
   * no ca.
   *
   * Whether it can be re-opened is decided by the **clock**, with the same `isShiftStillRunning()` the API
   * uses: a check-out that happened inside the ca's working time is one the employee may undo, whatever
   * status the row ended up with. Reading the status instead (`EARLY_LEAVE`) hid the button from a late
   * arrival who left early — `LATE` is kept on such a row (SCRUM-68), so the two facts are independent.
   */
  function recordFor(shiftId: string | null): Attendance | null {
    return (
      todayRecords.find((record) => (record.shift_id ?? null) === shiftId) ??
      null
    );
  }

  function canReopen(record: Attendance | null): boolean {
    return (
      record?.check_out_at != null &&
      isShiftStillRunning(now, record.shift?.end_time ?? null)
    );
  }

  /** The ca the manager picked, for the re-open window of their own check-out. */
  const managerShiftEnd =
    shifts.find((shift) => shift.id === shiftChoice)?.end_time ?? null;
  const managerRecord = recordFor(shiftChoice || null);
  const managerCanRejoin =
    managerRecord?.check_out_at != null &&
    isShiftStillRunning(now, managerShiftEnd);


  function actionErrorMessage(
    status: number,
    data: { error?: string } | null,
  ): string {
    if (status === 401) {
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (status === 403) {
      return "Tài khoản của bạn không thể chấm công (chủ sở hữu không chấm công, và bạn cần thuộc một chi nhánh).";
    }

    // 400/404/409 carry the real reason from the API (no ca today, already checked in, …), so that
    // sentence is shown rather than a generic one.
    return data?.error ?? "Không thể thực hiện thao tác. Vui lòng thử lại.";
  }

  /**
   * The device's position, or `null` when it is unavailable or refused. A denied location does not block
   * the check-in: the record is stored without a point, `/attendance` reads it as "Thiếu toạ độ" and the
   * manager judges it. The distance is never computed here — the database derives it from the point.
   */
  async function requestPosition(): Promise<{
    latitude: number;
    longitude: number;
  } | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    });
  }

  async function submitCheckIn(shiftId: string | null, rejoin = false) {
    setActionError("");
    setNotice("");

    const position = await requestPosition();

    if (
      !position &&
      !window.confirm(
        "Không lấy được vị trí hiện tại. Vẫn chấm công mà không kèm toạ độ?",
      )
    ) {
      return;
    }

    setBusy("check-in");

    try {
      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          // The employee's branch and ca come from today's assignment, so only a manager names them.
          branch_id: isManager ? selectedBranchId || null : null,
          shift_id: shiftId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setActionError(actionErrorMessage(response.status, data));
        return;
      }

      const record = (await response.json()) as Attendance;
      setNotice(
        rejoin
          ? `Đã vào ca lại — giờ vào vẫn là ${formatTime(record.check_in_at)}.`
          : `Đã ghi nhận vào ca lúc ${formatTime(record.check_in_at)}.`,
      );
      refresh();
    } catch {
      setActionError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function submitCheckOut(record: Attendance) {
    setActionError("");
    setNotice("");

    const position = await requestPosition();

    if (
      !position &&
      !window.confirm(
        "Không lấy được vị trí hiện tại. Vẫn kết thúc ca mà không kèm toạ độ?",
      )
    ) {
      return;
    }

    setBusy("check-out");

    try {
      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance_id: record.id,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setActionError(actionErrorMessage(response.status, data));
        return;
      }

      const closed = (await response.json()) as Attendance;
      setNotice(`Đã ghi nhận ra ca lúc ${formatTime(closed.check_out_at)}.`);
      refresh();
    } catch {
      setActionError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-surface p-10 text-xs text-slate-400">
        <Loader2 size={16} className="animate-spin text-primary" />
        Đang tải dữ liệu chấm công...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Vận hành ca / SCRUM-68
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Chấm công
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {isManager
              ? "Ghi nhận giờ vào ca / ra ca kèm vị trí GPS cho chi nhánh bạn phụ trách."
              : "Ghi nhận giờ vào ca / ra ca kèm vị trí GPS theo ca làm việc hôm nay của bạn."}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className={`${secondaryButtonClassName} self-start`}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          Làm mới
        </button>
      </div>

      {pageError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {pageError}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {actionError}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
          {notice}
        </div>
      ) : null}

      {!isManager && profile?.branch_id === null ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[10px] font-semibold uppercase text-slate-400">
              Chưa gán chi nhánh
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Tài khoản của bạn chưa thuộc chi nhánh nào nên chưa thể chấm công. Hãy đề nghị
              chủ sở hữu gán chi nhánh cho bạn ở màn hình Quản lý nhân sự.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {isManager ? "Chi nhánh phụ trách" : "Ca hôm nay"}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              {isManager ? <Building2 size={16} /> : <CalendarRange size={16} />}
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {isManager ? scopedBranches.length : todayAssignments.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {isManager
              ? "Chi nhánh bạn được phân phụ trách"
              : "Ca làm việc đã xếp trong ngày"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đã vào ca
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <LogIn size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {todayRecords.filter((record) => record.check_in_at).length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">Bản ghi vào ca hôm nay</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đang trong ca
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {openRecords.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">Bản ghi chưa có giờ ra</p>
        </article>
      </div>


      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Hôm nay</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {weekdayShort(today)} {formatDayDate(today)}
              </p>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-slate-400">
              <MapPin size={11} />
              Toạ độ lấy từ thiết bị của bạn, khoảng cách do hệ thống tính.
            </p>
          </div>
        </div>

        {isManager ? (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <label className="text-xs font-semibold text-slate-600 sm:min-w-56">
              Chi nhánh
              <select
                className={inputClassName}
                value={selectedBranchId}
                onChange={(event) => setBranchChoice(event.target.value)}
                disabled={scopedBranches.length === 0}
                aria-label="Chi nhánh chấm công"
              >
                {scopedBranches.length === 0 ? (
                  <option value="">Bạn chưa phụ trách chi nhánh nào</option>
                ) : (
                  scopedBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600 sm:min-w-56">
              Ca làm việc (không bắt buộc)
              <select
                className={inputClassName}
                value={shiftChoice}
                onChange={(event) => setShiftChoice(event.target.value)}
                aria-label="Ca làm việc"
              >
                <option value="">Không theo ca</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({formatShiftTime(shift.start_time)} –{" "}
                    {formatShiftTime(shift.end_time)})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={
                managerCanRejoin ? secondaryButtonClassName : primaryButtonClassName
              }
              onClick={() => submitCheckIn(shiftChoice || null, managerCanRejoin)}
              disabled={busy !== "" || !selectedBranchId}
            >
              {busy === "check-in" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : managerCanRejoin ? (
                <RotateCcw size={14} />
              ) : (
                <LogIn size={14} />
              )}
              {busy === "check-in"
                ? "Đang chấm công..."
                : managerCanRejoin
                  ? "Vào ca lại"
                  : "Vào ca"}
            </button>
          </div>
        ) : todayAssignments.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Hôm nay bạn không có ca làm việc. Nếu đã được phân ca, hãy bấm &quot;Làm mới&quot;.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todayAssignments.map((assignment) => {
              const record = recordFor(assignment.shift_id);
              const checkInAt = record?.check_in_at ?? null;
              // The ca's end time stands in for a missing click (SCRUM-75), so the chip reads
              // "Đã ra ca lúc 17:00 (tự động)" instead of leaving the row open for ever.
              const checkOut = record
                ? effectiveCheckOut(record, record.shift)
                : { at: null, automatic: false };
              // The ca is still running, so the check-out can still be undone (the API re-checks the clock).
              const canRejoin = canReopen(record);
              // A template without hours cannot judge punctuality, so the row is only ever `ON_TIME` —
              // say it here instead of letting "Đúng giờ" look like a verdict the ca never supported.
              const shiftHours = assignment.shift?.start_time
                ? `${formatShiftTime(assignment.shift.start_time)} – ${formatShiftTime(assignment.shift.end_time)}`
                : "Ca chưa khai giờ nên không đối chiếu được đi muộn";

              return (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {assignment.shift?.name ?? "Ca làm việc"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{shiftHours}</p>
                  </div>

                  {checkInAt !== null && checkOut.at === null ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Đã vào ca lúc {formatTime(checkInAt)}
                    </span>
                  ) : checkOut.at !== null ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          canRejoin
                            ? "bg-orange-50 text-orange-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        Đã ra ca lúc {formatTime(checkOut.at)}
                        {checkOut.automatic ? " (tự động)" : ""}
                      </span>
                      {canRejoin ? (
                        <button
                          type="button"
                          className={secondaryButtonClassName}
                          onClick={() => submitCheckIn(assignment.shift_id, true)}
                          disabled={busy !== ""}
                        >
                          {busy === "check-in" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                          {busy === "check-in" ? "Đang xử lý..." : "Vào ca lại"}
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={primaryButtonClassName}
                      onClick={() => submitCheckIn(assignment.shift_id)}
                      disabled={busy !== ""}
                    >
                      {busy === "check-in" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <LogIn size={14} />
                      )}
                      {busy === "check-in" ? "Đang chấm công..." : "Vào ca"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>


      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <p className="text-[10px] font-semibold uppercase text-slate-400">
            Đang trong ca
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            Ca chưa ghi nhận giờ ra
          </p>
        </div>

        {openRecords.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Không có ca nào đang mở
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openRecords.map((record) => {
              // Time already banked for this ca; a pause between a check-out and a re-open is not in it.
              // A ca nobody closed counts up to its end time (SCRUM-75) — the same figure the timesheet
              // shows — and the hint below says so, because the row is still genuinely open here.
              const worked = effectiveWorkedHours(record, record.shift);
              const closed = effectiveCheckOut(record, record.shift);

              return (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {record.shift?.name ?? "Không theo ca"} · vào lúc{" "}
                      {formatTime(record.check_in_at)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {record.branch?.name ?? "—"} ·{" "}
                      {GEOFENCE_LABELS[geofenceVerdict(record)]}
                      {worked !== null ? ` · đã làm ${worked} h` : ""}
                      {record.resumed_at !== null ? " · đã vào ca lại" : ""}
                      {closed.automatic
                        ? " · ca đã hết giờ, hệ thống ghi giờ ra bằng giờ kết thúc ca"
                        : ""}
                    </p>
                  </div>

                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[record.status]}`}
                  >
                    {STATUS_LABELS[record.status]}
                  </span>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() => submitCheckOut(record)}
                    disabled={busy !== ""}
                  >
                    {busy === "check-out" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LogOut size={14} />
                    )}
                    {busy === "check-out" ? "Đang xử lý..." : "Ra ca"}
                  </button>
                </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <p className="text-[10px] font-semibold uppercase text-slate-400">
            Lịch sử {HISTORY_DAYS} ngày
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            Chấm công của tôi
          </p>
        </div>

        {records.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Chưa có dữ liệu chấm công
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map((record) => {
              const verdict = geofenceVerdict(record);
              // Total actually worked (SCRUM-69): a pause between "Ra ca" and "Vào ca lại" is not
              // included, and a ca nobody closed ends at the ca's end time (SCRUM-75).
              const worked = effectiveWorkedHours(record, record.shift);
              const closed = effectiveCheckOut(record, record.shift);

              return (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      {weekdayShort(record.work_date)}{" "}
                      {formatDayDate(record.work_date)} ·{" "}
                      {record.shift?.name ?? "Không theo ca"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {record.branch?.name ?? "—"} ·{" "}
                      {formatTime(record.check_in_at)} →{" "}
                      {formatTime(closed.at)}
                      {closed.automatic ? " (tự động)" : ""}
                      {worked !== null ? ` · ${worked} h` : ""}
                      {record.resumed_at !== null ? " · có vào ca lại" : ""}
                    </p>
                  </div>

                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${GEOFENCE_BADGES[verdict]}`}
                    >
                      {GEOFENCE_LABELS[verdict]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[record.status]}`}
                    >
                      {STATUS_LABELS[record.status]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

