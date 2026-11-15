"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Camera,
  Check,
  Clock3,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch } from "@/lib/domain/branchScope";
import {
  ATTENDANCE_STATUSES,
  type Attendance,
  type AttendanceExceptionStatus,
  type AttendancePhotoKind,
  type AttendanceStatus,
} from "@/lib/domain/entities/Attendance";
import type { ShiftAssignment } from "@/lib/domain/entities/Shift";
import { formatDayMonth, formatTime, weekdayShort } from "@/lib/i18n/format";
import {
  attendanceExceptionLabel,
  attendanceStatusLabel,
  geofenceLabel,
} from "@/lib/i18n/labels";
import type { Translate } from "@/lib/i18n/translate";
import {
  effectiveCheckOut,
  effectiveWorkedHours,
} from "@/lib/usecases/attendanceAutoClose";
import {
  deriveAttendanceExceptions,
  findNoShows,
  geofenceVerdict,
  groupAssignmentsByEmployeeDay,
  hasOpenException,
  type AttendanceException,
  type GeofenceVerdict,
} from "@/lib/usecases/attendanceExceptions";

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

type LoadResult = {
  records: Attendance[];
  branches: Branch[];
  /** Exact number of rows matching the filters (`X-Total-Count`), for the pager. */
  total: number;
  error: string | null;
};

/** One row of the SCRUM-24 directory, as the employee picker needs it. */
type StaffOption = {
  id: string;
  full_name: string;
  is_active: boolean;
};

type ComplaintTarget = {
  id: string;
  label: string;
  existing: string | null;
};

type CorrectionTarget = {
  id: string;
  label: string;
};

type CorrectionForm = {
  checkIn: string;
  checkOut: string;
  status: AttendanceStatus;
  note: string;
  reason: string;
};

/**
 * The record whose photos the dialog is showing (SCRUM-95). The two `has*` flags come from the row, so
 * the dialog knows which panes to ask for before any request is made — and can say "Chưa có ảnh" for a
 * web clock-in without a round trip.
 */
type PhotoTarget = {
  id: string;
  label: string;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
};

/** The two signed URLs, valid for a minute each; `null` until fetched (or when there is no such photo). */
type PhotoLinks = { in: string | null; out: string | null };

/**
 * The record whose anomaly the dialog is answering (SCRUM-97). The derived `exceptions` are carried in,
 * so the dialog lists exactly what the row's chips said — opening it never re-derives a second opinion.
 */
type ExceptionTarget = {
  id: string;
  label: string;
  note: string | null;
  resolved: boolean;
  exceptions: AttendanceException[];
};

/**
 * `datetime-local` has no timezone, so the value is read and written as a wall clock in the
 * business timezone: writing parses it as UTC+7 and reading formats it in Asia/Bangkok.
 */
const bangkokInputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toBangkokInputValue(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const parts = bangkokInputFormatter.formatToParts(parsed);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";

  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function fromBangkokInputValue(value: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}:00+07:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const STATUS_BADGES: Record<AttendanceStatus, string> = {
  ON_TIME: "bg-emerald-50 text-emerald-700",
  LATE: "bg-amber-50 text-amber-700",
  EARLY_LEAVE: "bg-orange-50 text-orange-700",
  ABSENT: "bg-rose-50 text-rose-700",
  INCOMPLETE: "bg-slate-100 text-slate-600",
};

const ALL = "all";

/** The App → Website sync cadence (A4): the mobile app writes the row, this screen re-reads the list. */
const AUTO_REFRESH_MS = 30_000;

/** Rows per page on the review screen (the API's own default is 200, for `/check-in`'s history). */
const PAGE_SIZE = 50;

// The clock, day and weekday labels come from `lib/i18n/format.ts`, the attendance status, exception
// and geofence labels from `lib/i18n/labels.ts` — shared with `/check-in` and the dashboard. The
// geofence verdict and every "what is wrong with this row" rule live in
// `lib/usecases/attendanceExceptions.ts` (SCRUM-96), so the chips, the filter and the KPI cannot
// disagree about the same record.

const GEOFENCE_BADGES: Record<GeofenceVerdict, string> = {
  INSIDE: "bg-emerald-50 text-emerald-700",
  OUTSIDE: "bg-rose-50 text-rose-700",
  UNKNOWN: "bg-slate-100 text-slate-600",
};

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

export default function AttendancePage() {
  // SCRUM-59/61: opening the timesheet is `attendance:view` — a manager capability since SCRUM-68, when
  // the employee's own timesheet moved to `/check-in` (the review screen's every action needs
  // `attendance:review` anyway, so an employee would only ever have read it). For a manager the screen
  // stays read-only outside the branches they head: Xác nhận / xử lý khiếu nại / sửa giờ are allowed only
  // there, while a complaint can still be raised on any record they can see.
  const { profile, can } = useProfile();
  const { locale, t } = useLocale();
  const viewerId = profile?.id ?? null;
  const managesAllBranches = can("branch:manage");
  const [records, setRecords] = useState<Attendance[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // SCRUM-61: the branches this caller may review (the owner all of them, a manager only their own).
  const manageableIds = new Set(
    branches
      .filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      )
      .map((branch) => branch.id),
  );
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | typeof ALL>(ALL);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /**
   * The employee picker (A4 "search the history"): an id from the SCRUM-24 directory, filtered by the
   * **database**. It replaces the old free-text box, which only looked at the rows already on the page.
   */
  const [employeeFilter, setEmployeeFilter] = useState(ALL);
  const [employees, setEmployees] = useState<StaffOption[]>([]);
  /** The page being shown and the exact number of matching rows (`X-Total-Count`). */
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  /**
   * "Chỉ công của tôi": the same list, narrowed to the signed-in account's own rows.
   *
   * A manager and the owner track the organization on this screen; their own ca have to be findable in it
   * too, and an employee cannot open the screen at all (SCRUM-68 — their own history is `/check-in`). It
   * travels to the API as `employee_id`, so the KPI cards, the counters and the table all describe the same
   * rows instead of the header promising a number the list does not show.
   */
  const [mineOnly, setMineOnly] = useState(false);

  /** The viewer's own id while the shortcut is on — `null` otherwise, and while the profile is loading. */
  const mineEmployeeId = mineOnly ? viewerId : null;

  /** "Cần xử lý": the alert-only view — the same rows the attention KPI counts. */
  const [attentionOnly, setAttentionOnly] = useState(false);

  /**
   * The plan behind the rows on screen (SCRUM-96's comparison). Read from `GET /api/schedules` for the
   * work dates in the table, so the request is bounded by what is displayed; an empty list only removes
   * the three comparison chips, and `scheduleError` says why instead of leaving the rows looking clean.
   */
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [scheduleError, setScheduleError] = useState("");

  /**
   * A4 "automatically synchronizes App → Website": the mobile app writes `attendance` straight into
   * Supabase, so this screen only learns about a check-in when it re-reads the table. On by default —
   * that is the behaviour the requirement asks for — and switchable because a reviewer reading one row
   * may prefer the table to hold still.
   */
  const [autoRefresh, setAutoRefresh] = useState(true);
  /** When the last successful read landed, so the header can say how fresh the table is. */
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [complaintTarget, setComplaintTarget] = useState<ComplaintTarget | null>(null);
  const [complaintText, setComplaintText] = useState("");
  const [savingComplaint, setSavingComplaint] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  const [correctionForm, setCorrectionForm] = useState<CorrectionForm>({
    checkIn: "",
    checkOut: "",
    status: "ON_TIME",
    note: "",
    reason: "",
  });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [resolvingId, setResolvingId] = useState("");
  const [verifyingId, setVerifyingId] = useState("");

  /**
   * Ảnh chấm công (SCRUM-95). The row stores an object path, not a URL, so opening the dialog is what
   * mints two one-minute signed links — never a link in the list response, never every row at load.
   */
  const [photoTarget, setPhotoTarget] = useState<PhotoTarget | null>(null);
  const [photoLinks, setPhotoLinks] = useState<PhotoLinks>({
    in: null,
    out: null,
  });
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  /** SCRUM-97: the anomaly dialog — which record, its derived kinds, and the note being typed. */
  const [exceptionTarget, setExceptionTarget] = useState<ExceptionTarget | null>(
    null,
  );
  const [exceptionNote, setExceptionNote] = useState("");
  const [savingException, setSavingException] = useState(false);

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead of
  // a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // Branch, employee, status, date range and the page are filtered by the database because a
      // timesheet grows by one row per employee per shift — a client-side filter would lie about the
      // counters as soon as a second page existed.
      const params = new URLSearchParams();

      if (branchFilter !== ALL) {
        params.set("branch_id", branchFilter);
      }

      if (statusFilter !== ALL) {
        params.set("status", statusFilter);
      }

      // "Chỉ công của tôi" wins over the picker (its select is disabled while the shortcut is on), and
      // the value — not the flags — is what the effect depends on, so the first load does not refetch
      // when the profile lands.
      const employeeScope =
        mineEmployeeId ?? (employeeFilter !== ALL ? employeeFilter : null);

      if (employeeScope) {
        params.set("employee_id", employeeScope);
      }

      if (startDate) {
        params.set("start_date", startDate);
      }

      if (endDate) {
        params.set("end_date", endDate);
      }

      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));

      const [attendanceResponse, branchesResponse] = await Promise.all([
        fetch(`/api/attendance?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);

      if (!attendanceResponse.ok) {
        const data = (await attendanceResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          records: [],
          branches: [],
          total: 0,
          error: data?.error ?? t("attendance.error.load"),
        };
      }

      const records = (await attendanceResponse.json()) as Attendance[];

      return {
        records,
        branches: branchesResponse.ok
          ? ((await branchesResponse.json()) as Branch[])
          : [],
        // The exact count is what makes the pager (and the "no-show" guard) honest; a response without
        // the header is one page, so its length is the best answer available.
        total: Number(
          attendanceResponse.headers.get("x-total-count") ?? records.length,
        ),
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRecords(result.records);
        setBranches(result.branches);
        setTotal(result.total);
        setPageError(result.error ?? "");
        setLoading(false);

        if (result.error === null) {
          setLastSyncedAt(new Date().toISOString());
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRecords([]);
        setBranches([]);
        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    branchFilter,
    statusFilter,
    mineEmployeeId,
    employeeFilter,
    startDate,
    endDate,
    page,
    reloadToken,
    t,
  ]);

  /**
   * The signed links are fetched only while the dialog is open, and only for the panes the row carries.
   * The effect body starts promises and never sets state synchronously (`react-hooks/set-state-in-effect`)
   * — `photoLoading` is switched on by the click that opened the dialog.
   */
  useEffect(() => {
    if (!photoTarget) {
      return;
    }

    let cancelled = false;

    const kinds: AttendancePhotoKind[] = [];

    if (photoTarget.hasCheckIn) {
      kinds.push("in");
    }

    if (photoTarget.hasCheckOut) {
      kinds.push("out");
    }

    Promise.all(
      kinds.map(async (kind) => {
        const response = await fetch(
          `/api/attendance/${photoTarget.id}/photo?kind=${kind}`,
          { cache: "no-store" },
        );

        // A 404 is the normal "no photo / retention removed it" answer, not a failure: the pane renders
        // "Chưa có ảnh" from the null instead of an error.
        if (!response.ok) {
          return [kind, null] as const;
        }

        const data = (await response.json().catch(() => null)) as {
          url?: string;
        } | null;

        return [
          kind,
          typeof data?.url === "string" ? data.url : null,
        ] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        const links: PhotoLinks = { in: null, out: null };

        entries.forEach(([kind, url]) => {
          links[kind] = url;
        });

        setPhotoLinks(links);
        setPhotoLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPhotoError(t("attendance.photoLoadFailed"));
        setPhotoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [photoTarget, t]);

  /**
   * The plan for the dates on screen, derived from the rows rather than from the filter inputs: an
   * unfiltered timesheet has no range of its own, and a wider range would only fetch assignments nobody
   * looks at.
   *
   * Kept as one string so the effect below depends on the *window*, not on the array identity: a silent
   * auto-refresh produces a new `records` array every 30 seconds and must not re-fetch the schedule.
   */
  const scheduleWindow = useMemo(() => {
    if (records.length === 0) {
      return null;
    }

    const dates = records.map((record) => record.work_date).sort();

    return `${dates[0]}|${dates[dates.length - 1]}`;
  }, [records]);

  useEffect(() => {
    if (!scheduleWindow) {
      return;
    }

    let cancelled = false;

    const [startDate, endDate] = scheduleWindow.split("|");

    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    // The same branch (and employee) filters as the table: the plan and the rows must describe one
    // slice of the organization, and one employee's history needs only their assignments.
    if (branchFilter !== ALL) {
      params.set("branch_id", branchFilter);
    }

    if (employeeFilter !== ALL) {
      params.set("employee_id", employeeFilter);
    }

    fetch(`/api/schedules?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setAssignments([]);
          setScheduleError(t("attendance.scheduleLoadFailed"));
          return;
        }

        const data = (await response.json()) as ShiftAssignment[];

        if (cancelled) {
          return;
        }

        setAssignments(data);
        setScheduleError("");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAssignments([]);
        setScheduleError(t("attendance.scheduleLoadFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [scheduleWindow, branchFilter, employeeFilter, t]);

  /**
   * A4 sync: one silent re-read every 30 seconds (the inbox's cadence). Bumping the token runs the load
   * effect *without* `setLoading`, so the table is replaced instead of flashing a spinner; a hidden tab
   * skips its tick and catches up as soon as it is visible again.
   */
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      setReloadToken((token) => token + 1);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, [autoRefresh]);

  /**
   * The employee picker's options (A4 history search). `GET /api/users` is the SCRUM-24 directory, which
   * every `attendance:view` caller may read; a failure leaves only "Tất cả nhân viên" in the list, and
   * the timesheet itself still loads — the picker is a convenience, not the screen.
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/users", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled || !response.ok) {
          return;
        }

        const data = (await response.json()) as StaffOption[];

        if (!cancelled) {
          setEmployees(data);
        }
      })
      .catch(() => {
        setEmployees([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  /** Opens the photo dialog and turns loading on here, so the effect above only starts promises. */
  function openPhotos(record: Attendance) {
    setPhotoTarget({
      id: record.id,
      label:
        record.employee?.full_name ??
        t("common.unknownEmployee", {
          code: record.employee_id.slice(0, 4),
        }),
      hasCheckIn: Boolean(record.check_in_photo_url),
      hasCheckOut: Boolean(record.check_out_photo_url),
    });
    setPhotoLinks({ in: null, out: null });
    setPhotoError("");
    setPhotoLoading(true);
  }

  function closePhotos() {
    setPhotoTarget(null);
    setPhotoLinks({ in: null, out: null });
    setPhotoLoading(false);
    setPhotoError("");
  }

  /** Opens the anomaly dialog with the row's own verdicts — never a second derivation. */
  function openException(record: Attendance, exceptions: AttendanceException[]) {
    setExceptionTarget({
      id: record.id,
      label:
        record.employee?.full_name ??
        t("common.unknownEmployee", { code: record.employee_id.slice(0, 4) }),
      note: record.exception_note,
      resolved: record.exception_status === "RESOLVED",
      exceptions,
    });
    setExceptionNote(record.exception_note ?? "");
    setPageError("");
  }

  function closeException() {
    setExceptionTarget(null);
    setExceptionNote("");
    setSavingException(false);
  }

  /**
   * Saves the decision. `RESOLVED` requires a note (the API answers `400` and the database CHECK repeats
   * it); `OPEN` re-opens and clears the note. Nothing about the timesheet is sent — that is "Sửa giờ".
   */
  async function submitException(status: AttendanceExceptionStatus) {
    if (!exceptionTarget) {
      return;
    }

    setSavingException(true);
    setPageError("");

    try {
      const response = await fetch(
        `/api/attendance/${exceptionTarget.id}/exception`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            note: exceptionNote.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setPageError(actionErrorMessage(response.status, data, t));
        return;
      }

      closeException();
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setSavingException(false);
    }
  }

  const plannedByEmployeeDay = useMemo(
    () => groupAssignmentsByEmployeeDay(assignments),
    [assignments],
  );

  /**
   * Every row's derived verdicts, computed once per load. `now` is read here rather than per row, so
   * the auto-close ("the ca has ended, nobody clocked out") is judged against one instant for the table.
   */
  const exceptionsByRecord = useMemo(() => {
    const now = new Date();
    const map = new Map<string, AttendanceException[]>();

    records.forEach((record) => {
      map.set(
        record.id,
        deriveAttendanceExceptions(
          record,
          plannedByEmployeeDay.get(
            `${record.employee_id}|${record.work_date}`,
          ) ?? [],
          now,
        ),
      );
    });

    return map;
  }, [records, plannedByEmployeeDay]);

  /**
   * A planned ca with no timesheet row: `NO_SHOW`, which has no row to carry a chip.
   *
   * Only judged on the full, unfiltered set: `status`, the employee picker and "Chỉ công của tôi" are
   * narrowed by the database, so under any of them the absent rows are simply not there — every ca of
   * everybody else would read as a no-show. `total <= PAGE_SIZE` says the loaded page *is* the whole
   * set; a larger timesheet asks the reviewer to narrow the range instead of guessing.
   */
  const canJudgeNoShows =
    statusFilter === ALL &&
    mineEmployeeId === null &&
    employeeFilter === ALL &&
    total <= PAGE_SIZE;

  const noShows = useMemo(
    () =>
      !canJudgeNoShows || records.length === 0
        ? []
        : findNoShows(assignments, records),
    [assignments, records, canJudgeNoShows],
  );

  /**
   * The only filter left on the client: "Cần xử lý" (the verdict is derived per row). Employee, date,
   * branch, status and the page travel to the API, so the counters and the pager describe the same rows.
   */
  const filtered = useMemo(
    () =>
      records.filter(
        (record) =>
          !attentionOnly ||
          hasOpenException(record, exceptionsByRecord.get(record.id) ?? []),
      ),
    [records, attentionOnly, exceptionsByRecord],
  );

  const onTimeCount = records.filter((record) => record.status === "ON_TIME").length;
  const lateCount = records.filter((record) => record.status === "LATE").length;
  const outsideCount = records.filter(
    (record) => geofenceVerdict(record) === "OUTSIDE",
  ).length;
  const openComplaintCount = records.filter(
    (record) => record.complaint_status === "OPEN",
  ).length;
  // A no-show has no row, so the KPI adds the plan's absences to the rows that still need a decision —
  // a resolved row is out of the queue (`hasOpenException`), though its chips stay visible.
  const attentionCount =
    records.filter((record) =>
      hasOpenException(record, exceptionsByRecord.get(record.id) ?? []),
    ).length + noShows.length;
  // Giờ làm counts the ca's end time for a record nobody closed (SCRUM-75), which is why the total
  // uses the effective figure and not only what the database accumulated.
  const totalHours =
    Math.round(
      records.reduce(
        (total, record) => total + (effectiveWorkedHours(record, record.shift) ?? 0),
        0,
      ) * 10,
    ) / 10;

  function actionErrorMessage(
    status: number,
    data: { error?: string } | null,
    t: Translate,
  ): string {
    if (status === 401) {
      return t("error.sessionExpired");
    }

    if (status === 403) {
      return t("attendance.error.forbidden");
    }

    if (status === 404) {
      return t("attendance.error.notFound");
    }

    return data?.error ?? t("error.generic");
  }

  async function verify(record: Attendance) {
    setVerifyingId(record.id);
    setPageError("");

    try {
      const response = await fetch(`/api/attendance/${record.id}/verify`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data, t));
        return;
      }

      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setVerifyingId("");
    }
  }

  function openComplaint(record: Attendance) {
    setComplaintTarget({
      id: record.id,
      label: record.employee?.full_name ?? t("common.unknownEmployee", {
        code: record.employee_id.slice(0, 4),
      }),
      existing: record.complaint,
    });
    setComplaintText(record.complaint ?? "");
    setPageError("");
  }

  function closeComplaint() {
    setComplaintTarget(null);
    setComplaintText("");
  }

  async function submitComplaint() {
    if (!complaintTarget) {
      return;
    }

    const complaint = complaintText.trim();

    if (!complaint) {
      setPageError(t("attendance.error.complaintRequired"));
      return;
    }

    setSavingComplaint(true);
    setPageError("");

    try {
      const response = await fetch("/api/attendance/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance_id: complaintTarget.id,
          complaint,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data, t));
        return;
      }

      closeComplaint();
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setSavingComplaint(false);
    }
  }

  function openCorrection(record: Attendance) {
    setCorrectionTarget({
      id: record.id,
      label:
        record.employee?.full_name ??
        t("common.unknownEmployee", { code: record.employee_id.slice(0, 4) }),
    });
    setCorrectionForm({
      checkIn: toBangkokInputValue(record.check_in_at),
      // A record the system closed at the ca's end time (SCRUM-75) is pre-filled with that value, so
      // "Lưu thay đổi" turns the fallback into a recorded check-out with who and why attached.
      checkOut: toBangkokInputValue(effectiveCheckOut(record, record.shift).at),
      status: record.status,
      note: record.note ?? "",
      reason: "",
    });
    setPageError("");
  }

  function closeCorrection() {
    setCorrectionTarget(null);
  }

  async function submitCorrection() {
    if (!correctionTarget) {
      return;
    }

    if (!correctionForm.reason.trim()) {
      setPageError(t("attendance.error.reasonRequired"));
      return;
    }

    setSavingCorrection(true);
    setPageError("");

    try {
      const response = await fetch(`/api/attendance/${correctionTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_in_at: fromBangkokInputValue(correctionForm.checkIn),
          check_out_at: fromBangkokInputValue(correctionForm.checkOut),
          status: correctionForm.status,
          note: correctionForm.note.trim() || null,
          correction_reason: correctionForm.reason.trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data, t));
        return;
      }

      closeCorrection();
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setSavingCorrection(false);
    }
  }

  async function resolveComplaint(record: Attendance) {
    setResolvingId(record.id);
    setPageError("");

    try {
      const response = await fetch(`/api/attendance/complaints/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data, t));
        return;
      }

      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setResolvingId("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("attendance.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("nav.attendance")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t("attendance.subtitle")}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
              aria-pressed={autoRefresh}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                autoRefresh
                  ? "border-blue-200 bg-blue-50 font-semibold text-primary"
                  : "border-slate-200 bg-surface font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              <RefreshCw size={14} />
              {t("attendance.autoRefresh")}
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
              {t("common.reload")}
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            {t("attendance.autoRefreshHint", {
              time: formatTime(lastSyncedAt, locale, "--:--"),
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("attendance.kpiRecords")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <Clock3 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {records.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {t("attendance.kpiRecordsNote", { hours: totalHours })}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("attendanceStatus.onTime")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {onTimeCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            {t("attendance.kpiOnTimeNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("attendanceStatus.late")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <MapPin size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {lateCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            {t("attendance.kpiLateNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("attendance.kpiAttention")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {attentionCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            {t("attendance.kpiAttentionNote", {
              outside: outsideCount,
              complaints: openComplaintCount,
            })}
          </p>
        </article>
      </div>

      {pageError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs xl:w-72">
            <UserRound size={14} className="shrink-0 text-slate-400" />
            <select
              aria-label={t("attendance.employeeFilterAria")}
              value={employeeFilter}
              onChange={(event) => {
                setEmployeeFilter(event.target.value);
                setPage(1);
              }}
              disabled={mineOnly}
              className="w-full bg-transparent text-xs outline-none disabled:opacity-60"
            >
              <option value={ALL}>{t("common.allEmployees")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                  {employee.is_active
                    ? ""
                    : ` (${t("employeeStatus.resigned")})`}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMineOnly((current) => !current);
                setPage(1);
              }}
              aria-pressed={mineOnly}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                mineOnly
                  ? "border-blue-200 bg-blue-50 font-semibold text-primary"
                  : "border-slate-200 bg-surface font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              <UserRound size={14} />
              {t("attendance.mineOnly")}
            </button>

            <button
              type="button"
              onClick={() => setAttentionOnly((current) => !current)}
              aria-pressed={attentionOnly}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                attentionOnly
                  ? "border-amber-200 bg-amber-50 font-semibold text-amber-700"
                  : "border-slate-200 bg-surface font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle size={14} />
              {t("attendance.attentionOnly")}
              {attentionCount > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">
                  {attentionCount}
                </span>
              )}
            </button>

            <select
              aria-label={t("common.filterBranchAria")}
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>{t("common.allBranches")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t("common.fromDate")}
              <input
                type="date"
                aria-label={t("common.fromDate")}
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setPage(1);
                }}
                className="text-xs font-normal normal-case tracking-normal outline-none"
              />
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t("common.toDate")}
              <input
                type="date"
                aria-label={t("common.toDate")}
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setPage(1);
                }}
                className="text-xs font-normal normal-case tracking-normal outline-none"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter(ALL);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              statusFilter === ALL
                ? "bg-blue-50 text-primary"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t("common.allStatuses")}
          </button>
          {ATTENDANCE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                statusFilter === status
                  ? STATUS_BADGES[status]
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {attendanceStatusLabel(status, t)}
            </button>
          ))}
          <p className="ml-auto text-[10px] text-slate-400">
            {t("attendance.visibleCount", { count: filtered.length })}
          </p>
        </div>

        {(noShows.length > 0 || scheduleError) && (
          <div className="space-y-1.5 border-b border-amber-100 bg-amber-50/70 px-3 py-2">
            {noShows.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-amber-800">
                  {t("attendance.noShowTitle", { count: noShows.length })}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {noShows.slice(0, 10).map((assignment) => (
                    <li
                      key={assignment.id}
                      className="whitespace-nowrap rounded-full border border-amber-200 bg-surface px-2 py-0.5 text-[10px] text-amber-800"
                    >
                      {assignment.employee?.full_name ?? "—"} ·{" "}
                      {weekdayShort(assignment.work_date, locale)}{" "}
                      {formatDayMonth(assignment.work_date, locale)} ·{" "}
                      {assignment.shift?.name ?? t("attendance.offSchedule")}
                    </li>
                  ))}
                  {noShows.length > 10 && (
                    <li className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      +{noShows.length - 10}
                    </li>
                  )}
                </ul>
              </>
            )}
            {scheduleError && (
              <p className="text-[10px] text-amber-700">{scheduleError}</p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("common.employee")}</th>
                <th className="px-4 py-3">{t("attendance.columnDay")}</th>
                <th className="px-4 py-3">{t("attendance.columnTimes")}</th>
                <th className="px-4 py-3 text-right">{t("attendance.columnHours")}</th>
                <th className="px-4 py-3">{t("attendance.columnLocation")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      {t("attendance.loading")}
                    </span>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {records.length === 0
                      ? t("attendance.emptyRange")
                      : t("attendance.emptySearch")}
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((record) => {
                  const exceptions = exceptionsByRecord.get(record.id) ?? [];
                  const verdict = geofenceVerdict(record);
                  // A record nobody closed reads as closed at the ca's end time (SCRUM-75); a real
                  // check-out always wins over that fallback.
                  const checkOut = effectiveCheckOut(record, record.shift);
                  const hours = effectiveWorkedHours(record, record.shift);

                  return (
                    <tr
                      key={record.id}
                      className="border-t border-slate-100 align-top transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-primary">
                            {initials(record.employee?.full_name)}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {record.employee?.full_name ??
                                t("common.unknownEmployee", {
                                  code: record.employee_id.slice(0, 4),
                                })}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {record.branch?.name ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-700">
                          {weekdayShort(record.work_date, locale)}{" "}
                          {formatDayMonth(record.work_date, locale)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {record.shift?.name ?? t("attendance.offSchedule")}
                        </p>
                      </td>
                      <td className="px-4 py-4 tabular-nums text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} className="text-slate-400" />
                          {formatTime(record.check_in_at, locale, "--:--")} →{" "}
                          {formatTime(checkOut.at, locale, "--:--")}
                        </span>
                        {checkOut.automatic && (
                          <span
                            className="ml-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
                            title={t("attendance.automaticHint")}
                          >
                            {t("attendance.automaticBadge")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                        {hours === null ? "—" : t("attendance.hours", { hours })}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            GEOFENCE_BADGES[verdict]
                          }`}
                        >
                          <MapPin size={12} />
                          {geofenceLabel(verdict, t)}
                        </span>
                        {record.check_in_distance_m !== null && record.branch && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {t("attendance.distanceOf", {
                              distance: record.check_in_distance_m,
                              radius: record.branch.attendance_radius,
                            })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              STATUS_BADGES[record.status]
                            }`}
                          >
                            {attendanceStatusLabel(record.status, t)}
                          </span>
                          {record.verified_at && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
                              title={t("attendance.verifiedAt", {
                                time: formatTime(record.verified_at, locale, "--:--"),
                              })}
                            >
                              <ShieldCheck size={12} />
                              {t("attendance.verified")}
                            </span>
                          )}
                        </div>
                        {exceptions.length > 0 && (
                          <div className="mt-1 flex max-w-56 flex-wrap gap-1">
                            {exceptions.map((entry) => (
                              <span
                                key={entry.kind}
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                  entry.severity === "alert"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {attendanceExceptionLabel(entry.kind, t)}
                              </span>
                            ))}
                          </div>
                        )}
                        {record.exception_status === "RESOLVED" && (
                          <span
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700"
                            title={t("attendance.exceptionResolvedAt", {
                              time: formatTime(
                                record.exception_resolved_at,
                                locale,
                                "--:--",
                              ),
                              note: record.exception_note ?? "",
                            })}
                          >
                            <ShieldCheck size={11} />
                            {t("attendance.exceptionBadge")}
                          </span>
                        )}
                        {record.complaint && (
                          <div className="mt-1 max-w-56">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                record.complaint_status === "OPEN"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {record.complaint_status === "OPEN"
                                ? t("attendance.complaintOpen")
                                : t("attendance.complaintResolved")}
                            </span>
                            <p className="mt-1 text-[11px] text-rose-600">
                              {record.complaint}
                            </p>
                          </div>
                        )}
                        {record.corrected_at && (
                          <p className="mt-1 max-w-56 text-[11px] text-slate-500">
                            {t("attendance.correctedNote", {
                              reason: record.correction_reason ?? "",
                            })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          {(record.check_in_photo_url ||
                            record.check_out_photo_url) && (
                            <button
                              type="button"
                              onClick={() => openPhotos(record)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Camera size={13} />
                              {t("attendance.photoOpen")}
                            </button>
                          )}
                          {can("attendance:review") &&
                            manageableIds.has(record.branch_id) &&
                            exceptions.some(
                              (entry) => entry.severity === "alert",
                            ) && (
                              <button
                                type="button"
                                onClick={() =>
                                  openException(record, exceptions)
                                }
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                  record.exception_status === "RESOLVED"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                }`}
                              >
                                <ShieldCheck size={13} />
                                {record.exception_status === "RESOLVED"
                                  ? t("attendance.exceptionResolved")
                                  : t("attendance.exceptionResolve")}
                              </button>
                            )}
                          {can("attendance:review") &&
                            manageableIds.has(record.branch_id) &&
                            !record.verified_at && (
                            <button
                              type="button"
                              onClick={() => void verify(record)}
                              disabled={verifyingId === record.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {verifyingId === record.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Check size={13} />
                              )}
                              {t("attendance.verify")}
                            </button>
                          )}
                          {can("attendance:review") &&
                            manageableIds.has(record.branch_id) &&
                            record.complaint_status === "OPEN" && (
                              <button
                                type="button"
                                onClick={() => void resolveComplaint(record)}
                                disabled={resolvingId === record.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                              >
                                {resolvingId === record.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                                {t("attendance.resolveComplaint")}
                              </button>
                            )}
                          {can("attendance:review") &&
                            manageableIds.has(record.branch_id) && (
                            <button
                              type="button"
                              onClick={() => openCorrection(record)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Pencil size={13} />
                              {t("attendance.correct")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openComplaint(record)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <MessageSquareWarning size={13} />
                            {record.complaint
                              ? t("attendance.editComplaint")
                              : t("attendance.writeComplaint")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <p className="text-[10px] text-slate-500">
            {t("attendance.pageRange", {
              from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("attendance.prevPage")}
            </button>
            <span className="whitespace-nowrap text-[10px] text-slate-400">
              {t("attendance.pageOf", {
                page,
                pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
              })}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page * PAGE_SIZE >= total || loading}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("attendance.nextPage")}
            </button>
          </div>
        </div>
      </section>

      {correctionTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Pencil size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {t("attendance.correctionTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("attendance.correctionSubtitle", {
                      name: correctionTarget.label,
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closeCorrection}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                {t("attendance.checkInLabel")}
                <input
                  type="datetime-local"
                  value={correctionForm.checkIn}
                  onChange={(event) =>
                    setCorrectionForm((value) => ({
                      ...value,
                      checkIn: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("attendance.checkOutLabel")}
                <input
                  type="datetime-local"
                  value={correctionForm.checkOut}
                  onChange={(event) =>
                    setCorrectionForm((value) => ({
                      ...value,
                      checkOut: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
                />
              </label>
            </div>

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              {t("common.status")}
              <select
                value={correctionForm.status}
                onChange={(event) =>
                  setCorrectionForm((value) => ({
                    ...value,
                    status: event.target.value as AttendanceStatus,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
              >
                {ATTENDANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {attendanceStatusLabel(status, t)}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              {t("common.note")}
              <textarea
                value={correctionForm.note}
                onChange={(event) =>
                  setCorrectionForm((value) => ({
                    ...value,
                    note: event.target.value,
                  }))
                }
                rows={2}
                maxLength={500}
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
              />
            </label>

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              {t("attendance.reasonLabel")}{" "}
              <span className="text-rose-500">*</span>
              <textarea
                value={correctionForm.reason}
                onChange={(event) =>
                  setCorrectionForm((value) => ({
                    ...value,
                    reason: event.target.value,
                  }))
                }
                rows={2}
                maxLength={500}
                placeholder={t("attendance.reasonPlaceholder")}
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCorrection}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitCorrection()}
                disabled={savingCorrection || !correctionForm.reason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingCorrection && (
                  <Loader2 size={13} className="animate-spin" />
                )}
                {savingCorrection
                  ? t("common.saving")
                  : t("attendance.saveCorrection")}
              </button>
            </div>
          </div>
        </div>
      )}

      {complaintTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  {t("attendance.complaintTitle")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("attendance.complaintSubtitle", {
                    name: complaintTarget.label,
                  })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closeComplaint}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {complaintTarget.existing && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                {t("attendance.complaintExisting", {
                  text: complaintTarget.existing,
                })}
              </p>
            )}

            <textarea
              value={complaintText}
              onChange={(event) => setComplaintText(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t("attendance.complaintPlaceholder")}
              className="mt-4 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeComplaint}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitComplaint()}
                disabled={savingComplaint || !complaintText.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingComplaint && <Loader2 size={13} className="animate-spin" />}
                {savingComplaint ? t("common.saving") : t("attendance.saveComplaint")}
              </button>
            </div>
          </div>
        </div>
      )}

      {photoTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">
                  {t("attendance.photoTitle")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("attendance.photoSubtitle", { name: photoTarget.label })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closePhotos}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {photoError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
              >
                {photoError}
              </p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(["in", "out"] as const).map((kind) => {
                const hasPhoto =
                  kind === "in"
                    ? photoTarget.hasCheckIn
                    : photoTarget.hasCheckOut;
                const label =
                  kind === "in"
                    ? t("attendance.photoCheckIn")
                    : t("attendance.photoCheckOut");
                const url = photoLinks[kind];

                return (
                  <figure
                    key={kind}
                    className="rounded-xl border border-slate-200/80 bg-app p-3"
                  >
                    <figcaption className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </figcaption>

                    {photoLoading && hasPhoto ? (
                      <div className="mt-3 flex h-40 items-center justify-center rounded-lg bg-surface-muted text-slate-400">
                        <Loader2 size={18} className="animate-spin" />
                      </div>
                    ) : url ? (
                      <>
                        <Image
                          src={url}
                          alt={label}
                          width={480}
                          height={480}
                          unoptimized
                          className="mt-3 h-40 w-full rounded-lg border border-slate-200 bg-surface-muted object-contain sm:h-56"
                        />
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-[11px] font-semibold text-primary hover:underline"
                        >
                          {t("attendance.photoOpenFull")}
                        </a>
                      </>
                    ) : (
                      <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-surface text-xs text-slate-400">
                        {t("attendance.photoNone")}
                      </div>
                    )}
                  </figure>
                );
              })}
            </div>

            <p className="mt-4 text-[10px] text-slate-400">
              {t("attendance.photoRetention")}
            </p>
          </div>
        </div>
      )}

      {exceptionTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {t("attendance.exceptionTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("attendance.exceptionSubtitle", {
                      name: exceptionTarget.label,
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closeException}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {exceptionTarget.exceptions.map((entry) => (
                <span
                  key={entry.kind}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    entry.severity === "alert"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {attendanceExceptionLabel(entry.kind, t)}
                </span>
              ))}
            </div>

            {exceptionTarget.resolved && exceptionTarget.note && (
              <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800">
                {t("attendance.exceptionExisting", {
                  note: exceptionTarget.note,
                })}
              </p>
            )}

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              {t("attendance.exceptionNoteLabel")}{" "}
              {!exceptionTarget.resolved && (
                <span className="text-rose-500">*</span>
              )}
              <textarea
                value={exceptionNote}
                onChange={(event) => setExceptionNote(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder={t("attendance.exceptionNotePlaceholder")}
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {exceptionTarget.resolved && (
                <button
                  type="button"
                  onClick={() => void submitException("OPEN")}
                  disabled={savingException}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  {t("attendance.exceptionReopen")}
                </button>
              )}
              <button
                type="button"
                onClick={closeException}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitException("RESOLVED")}
                disabled={savingException || !exceptionNote.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingException && (
                  <Loader2 size={13} className="animate-spin" />
                )}
                {savingException
                  ? t("common.saving")
                  : t("attendance.exceptionSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}