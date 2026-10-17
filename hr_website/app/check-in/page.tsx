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

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch } from "@/lib/domain/branchScope";
import type { Attendance, AttendanceStatus } from "@/lib/domain/entities/Attendance";
import type { Branch } from "@/lib/domain/entities/Branch";
import type { Shift, ShiftAssignment } from "@/lib/domain/entities/Shift";
import { isManagerRole } from "@/lib/domain/roles";
import {
  formatClockTime,
  formatDayMonth,
  formatTime,
  weekdayShort,
} from "@/lib/i18n/format";
import { attendanceStatusLabel, geofenceLabel } from "@/lib/i18n/labels";
import type { Translate } from "@/lib/i18n/translate";
import {
  effectiveCheckOut,
  effectiveWorkedHours,
} from "@/lib/usecases/attendanceAutoClose";
import { isShiftStillRunning } from "@/lib/usecases/attendanceStatus";

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

// The time / day / clock labels come from `lib/i18n/format.ts` and the attendance status from
// `lib/i18n/labels.ts`: one copy each, shared with `/attendance` and the dashboard. Every call passes
// `"--:--"` as the fallback, which is what this screen has always shown for a missing time.

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
  const { locale, t } = useLocale();
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
          error: data?.error ?? t("checkIn.error.history"),
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
        error: scheduleFailed ? t("checkIn.error.schedule") : null,
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
        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerId, isManager, historyStart, today, reloadToken, t]);

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
    t: Translate,
  ): string {
    if (status === 401) {
      return t("error.sessionExpired");
    }

    if (status === 403) {
      return t("checkIn.error.forbidden");
    }

    // 400/404/409 carry the real reason from the API (no ca today, already checked in, …), so that
    // sentence is shown rather than a generic one.
    return data?.error ?? t("error.generic");
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
      !window.confirm(t("checkIn.confirm.noLocationCheckIn"))
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
        setActionError(actionErrorMessage(response.status, data, t));
        return;
      }

      const record = (await response.json()) as Attendance;
      setNotice(
        rejoin
          ? t("checkIn.notice.rejoined", {
              time: formatTime(record.check_in_at, locale, "--:--"),
            })
          : t("checkIn.notice.checkedIn", {
              time: formatTime(record.check_in_at, locale, "--:--"),
            }),
      );
      refresh();
    } catch {
      setActionError(t("error.network"));
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
      !window.confirm(t("checkIn.confirm.noLocationCheckOut"))
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
        setActionError(actionErrorMessage(response.status, data, t));
        return;
      }

      const closed = (await response.json()) as Attendance;
      setNotice(
        t("checkIn.notice.checkedOut", {
          time: formatTime(closed.check_out_at, locale, "--:--"),
        }),
      );
      refresh();
    } catch {
      setActionError(t("error.network"));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-surface p-10 text-xs text-slate-400">
        <Loader2 size={16} className="animate-spin text-primary" />
        {t("checkIn.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("checkIn.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("nav.checkIn")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {isManager ? t("checkIn.subtitleManager") : t("checkIn.subtitleEmployee")}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className={`${secondaryButtonClassName} self-start`}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          {t("common.reload")}
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
              {t("checkIn.noBranchTitle")}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {t("checkIn.noBranchHint")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {isManager ? t("checkIn.tileBranches") : t("checkIn.tileShifts")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              {isManager ? <Building2 size={16} /> : <CalendarRange size={16} />}
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {isManager ? scopedBranches.length : todayAssignments.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {isManager ? t("checkIn.tileBranchesNote") : t("checkIn.tileShiftsNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("checkIn.tileCheckedIn")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <LogIn size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {todayRecords.filter((record) => record.check_in_at).length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {t("checkIn.tileCheckedInNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("checkIn.tileOpen")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {openRecords.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">{t("checkIn.tileOpenNote")}</p>
        </article>
      </div>


      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">
                {t("common.today")}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {weekdayShort(today, locale)} {formatDayMonth(today, locale)}
              </p>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-slate-400">
              <MapPin size={11} />
              {t("checkIn.locationNote")}
            </p>
          </div>
        </div>

        {isManager ? (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <label className="text-xs font-semibold text-slate-600 sm:min-w-56">
              {t("common.branch")}
              <select
                className={inputClassName}
                value={selectedBranchId}
                onChange={(event) => setBranchChoice(event.target.value)}
                disabled={scopedBranches.length === 0}
                aria-label={t("checkIn.branchAria")}
              >
                {scopedBranches.length === 0 ? (
                  <option value="">{t("checkIn.noManagedBranch")}</option>
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
              {t("checkIn.shiftOptional")}
              <select
                className={inputClassName}
                value={shiftChoice}
                onChange={(event) => setShiftChoice(event.target.value)}
                aria-label={t("common.shift")}
              >
                <option value="">{t("checkIn.noShiftOption")}</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({formatClockTime(shift.start_time)} –{" "}
                    {formatClockTime(shift.end_time)})
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
                ? t("checkIn.checkingIn")
                : managerCanRejoin
                  ? t("checkIn.rejoin")
                  : t("checkIn.checkIn")}
            </button>
          </div>
        ) : todayAssignments.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            {t("checkIn.noShiftToday")}
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
                ? `${formatClockTime(assignment.shift.start_time)} – ${formatClockTime(assignment.shift.end_time)}`
                : t("checkIn.shiftWithoutHours");

              return (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {assignment.shift?.name ?? t("common.shift")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{shiftHours}</p>
                  </div>

                  {checkInAt !== null && checkOut.at === null ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {t("checkIn.checkedInAt", {
                        time: formatTime(checkInAt, locale, "--:--"),
                      })}
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
                        {t("checkIn.checkedOutAt", {
                          time: formatTime(checkOut.at, locale, "--:--"),
                        })}
                        {checkOut.automatic ? ` ${t("checkIn.automatic")}` : ""}
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
                          {busy === "check-in" ? t("checkIn.processing") : t("checkIn.rejoin")}
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
                      {busy === "check-in" ? t("checkIn.checkingIn") : t("checkIn.checkIn")}
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
            {t("checkIn.tileOpen")}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {t("checkIn.openSectionTitle")}
          </p>
        </div>

        {openRecords.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            {t("checkIn.noOpenRecords")}
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
                      {t("checkIn.openRowTitle", {
                        shift: record.shift?.name ?? t("checkIn.noShiftOption"),
                        time: formatTime(record.check_in_at, locale, "--:--"),
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {record.branch?.name ?? "—"} ·{" "}
                      {geofenceLabel(geofenceVerdict(record), t)}
                      {worked !== null
                        ? ` ${t("checkIn.workedHours", { hours: worked })}`
                        : ""}
                      {record.resumed_at !== null
                        ? ` ${t("checkIn.resumedMarker")}`
                        : ""}
                      {closed.automatic ? ` ${t("checkIn.autoClosedMarker")}` : ""}
                    </p>
                  </div>

                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[record.status]}`}
                  >
                    {attendanceStatusLabel(record.status, t)}
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
                    {busy === "check-out" ? t("checkIn.processing") : t("checkIn.checkOut")}
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
            {t("checkIn.historyEyebrow", { days: HISTORY_DAYS })}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {t("checkIn.myAttendance")}
          </p>
        </div>

        {records.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            {t("checkIn.historyEmpty")}
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
                      {weekdayShort(record.work_date, locale)}{" "}
                      {formatDayMonth(record.work_date, locale)} ·{" "}
                      {record.shift?.name ?? t("checkIn.noShiftOption")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {record.branch?.name ?? "—"} ·{" "}
                      {formatTime(record.check_in_at, locale, "--:--")} →{" "}
                      {formatTime(closed.at, locale, "--:--")}
                      {closed.automatic ? ` ${t("checkIn.automatic")}` : ""}
                      {worked !== null
                        ? ` ${t("checkIn.workedHoursShort", { hours: worked })}`
                        : ""}
                      {record.resumed_at !== null
                        ? ` ${t("checkIn.resumedMarker")}`
                        : ""}
                    </p>
                  </div>

                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${GEOFENCE_BADGES[verdict]}`}
                    >
                      {geofenceLabel(verdict, t)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[record.status]}`}
                    >
                      {attendanceStatusLabel(record.status, t)}
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

