"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch } from "@/lib/domain/branchScope";
import {
  ATTENDANCE_STATUSES,
  type Attendance,
  type AttendanceStatus,
} from "@/lib/domain/entities/Attendance";
import {
  effectiveCheckOut,
  effectiveWorkedHours,
} from "@/lib/usecases/attendanceAutoClose";

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

type LoadResult = {
  records: Attendance[];
  branches: Branch[];
  error: string | null;
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

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: "Đúng giờ",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  ABSENT: "Vắng mặt",
  INCOMPLETE: "Thiếu giờ ra",
};

const STATUS_BADGES: Record<AttendanceStatus, string> = {
  ON_TIME: "bg-emerald-50 text-emerald-700",
  LATE: "bg-amber-50 text-amber-700",
  EARLY_LEAVE: "bg-orange-50 text-orange-700",
  ABSENT: "bg-rose-50 text-rose-700",
  INCOMPLETE: "bg-slate-100 text-slate-600",
};

const ALL = "all";

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(value: string | null): string {
  if (!value) {
    return "--:--";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "--:--" : timeFormatter.format(parsed);
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

type GeofenceVerdict = "INSIDE" | "OUTSIDE" | "UNKNOWN";

/**
 * The geofence verdict of SCRUM-22: a check-in point is valid when it lies within the branch's
 * allowed radius. A missing distance, or a branch without coordinates, cannot be judged.
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

/** Records a manager still has to look at: outside the geofence, an open complaint, or unverified. */
function needsAttention(record: Attendance): boolean {
  return (
    geofenceVerdict(record) === "OUTSIDE" ||
    record.complaint_status === "OPEN" ||
    !record.verified_at
  );
}

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
  const [query, setQuery] = useState("");
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

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead of
  // a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // Branch, status, employee and date range are filtered by the database because a timesheet grows by
      // one row per employee per shift; only the name search is client-side.
      const params = new URLSearchParams();

      if (branchFilter !== ALL) {
        params.set("branch_id", branchFilter);
      }

      if (statusFilter !== ALL) {
        params.set("status", statusFilter);
      }

      // `mineEmployeeId` is the viewer's id while "Chỉ công của tôi" is on, otherwise null: the value (not
      // the flag) is what the effect depends on, so the first load does not refetch when the profile lands.
      if (mineEmployeeId) {
        params.set("employee_id", mineEmployeeId);
      }

      if (startDate) {
        params.set("start_date", startDate);
      }

      if (endDate) {
        params.set("end_date", endDate);
      }

      const queryString = params.toString();

      const [attendanceResponse, branchesResponse] = await Promise.all([
        fetch(`/api/attendance${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store",
        }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);

      if (!attendanceResponse.ok) {
        const data = (await attendanceResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          records: [],
          branches: [],
          error: data?.error ?? "Không thể tải bảng công.",
        };
      }

      return {
        records: (await attendanceResponse.json()) as Attendance[],
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

        setRecords(result.records);
        setBranches(result.branches);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRecords([]);
        setBranches([]);
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchFilter, statusFilter, mineEmployeeId, startDate, endDate, reloadToken]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return records;
    }

    return records.filter((record) =>
      (record.employee?.full_name ?? "").toLowerCase().includes(keyword),
    );
  }, [records, query]);

  const onTimeCount = records.filter((record) => record.status === "ON_TIME").length;
  const lateCount = records.filter((record) => record.status === "LATE").length;
  const outsideCount = records.filter(
    (record) => geofenceVerdict(record) === "OUTSIDE",
  ).length;
  const openComplaintCount = records.filter(
    (record) => record.complaint_status === "OPEN",
  ).length;
  const attentionCount = records.filter(needsAttention).length;
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
  ): string {
    if (status === 401) {
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (status === 403) {
      return "Tài khoản của bạn không có quyền thực hiện thao tác này (chỉ chủ sở hữu hoặc quản lý).";
    }

    if (status === 404) {
      return "Không tìm thấy bản ghi chấm công.";
    }

    return data?.error ?? "Không thể thực hiện thao tác. Vui lòng thử lại.";
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
        setPageError(actionErrorMessage(response.status, data));
        return;
      }

      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setVerifyingId("");
    }
  }

  function openComplaint(record: Attendance) {
    setComplaintTarget({
      id: record.id,
      label: record.employee?.full_name ?? `Nhân viên #${record.employee_id.slice(0, 4)}`,
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
      setPageError("Vui lòng nhập nội dung khiếu nại trước khi gửi.");
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
        setPageError(actionErrorMessage(response.status, data));
        return;
      }

      closeComplaint();
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSavingComplaint(false);
    }
  }

  function openCorrection(record: Attendance) {
    setCorrectionTarget({
      id: record.id,
      label:
        record.employee?.full_name ?? `Nhân viên #${record.employee_id.slice(0, 4)}`,
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
      setPageError("Vui lòng nhập lý do sửa giờ trước khi lưu.");
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
        setPageError(actionErrorMessage(response.status, data));
        return;
      }

      closeCorrection();
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
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
        setPageError(actionErrorMessage(response.status, data));
        return;
      }

      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setResolvingId("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Vận hành ca / SCRUM-21
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bảng công
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Đối soát giờ vào/ra, kiểm tra vị trí chấm công theo bán kính chi nhánh và xử lý
            khiếu nại của nhân viên.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          Làm mới
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Bản ghi theo bộ lọc
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <Clock3 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {records.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Tổng {totalHours} giờ đã ghi nhận
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đúng giờ
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {onTimeCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            Vào ca trong khung giờ quy định
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đi muộn
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <MapPin size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {lateCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            Cần đối chiếu với lịch làm việc
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Cần xử lý
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {attentionCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            {outsideCount} ngoài vùng · {openComplaintCount} khiếu nại chưa xử lý
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
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              aria-label="Tìm nhân viên trong bảng công"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên nhân viên"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMineOnly((current) => !current)}
              aria-pressed={mineOnly}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                mineOnly
                  ? "border-blue-200 bg-blue-50 font-semibold text-primary"
                  : "border-slate-200 bg-surface font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              <UserRound size={14} />
              Chỉ công của tôi
            </button>

            <select
              aria-label="Lọc theo chi nhánh"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Từ ngày
              <input
                type="date"
                aria-label="Từ ngày"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="text-xs font-normal normal-case tracking-normal outline-none"
              />
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Đến ngày
              <input
                type="date"
                aria-label="Đến ngày"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="text-xs font-normal normal-case tracking-normal outline-none"
              />
            </label>
          </div>
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
          {ATTENDANCE_STATUSES.map((status) => (
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
            {filtered.length} bản ghi hiển thị
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Ngày · Ca</th>
                <th className="px-4 py-3">Giờ vào / ra</th>
                <th className="px-4 py-3 text-right">Giờ làm</th>
                <th className="px-4 py-3">Vị trí chấm công</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      Đang tải bảng công...
                    </span>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {records.length === 0
                      ? "Chưa có bản ghi chấm công nào trong khoảng thời gian này"
                      : "Không có bản ghi phù hợp từ khoá tìm kiếm"}
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((record) => {
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
                                `Nhân viên #${record.employee_id.slice(0, 4)}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {record.branch?.name ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-700">
                          {weekdayShort(record.work_date)}{" "}
                          {formatDayDate(record.work_date)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {record.shift?.name ?? "Ngoài lịch"}
                        </p>
                      </td>
                      <td className="px-4 py-4 tabular-nums text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} className="text-slate-400" />
                          {formatTime(record.check_in_at)} →{" "}
                          {formatTime(checkOut.at)}
                        </span>
                        {checkOut.automatic && (
                          <span
                            className="ml-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
                            title="Nhân viên không bấm Ra ca: hệ thống ghi giờ ra bằng giờ kết thúc ca. Quản lý sửa giờ nếu thực tế khác."
                          >
                            tự động
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                        {hours === null ? "—" : `${hours} h`}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            GEOFENCE_BADGES[verdict]
                          }`}
                        >
                          <MapPin size={12} />
                          {GEOFENCE_LABELS[verdict]}
                        </span>
                        {record.check_in_distance_m !== null && record.branch && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {record.check_in_distance_m} m / bán kính{" "}
                            {record.branch.attendance_radius} m
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
                            {STATUS_LABELS[record.status]}
                          </span>
                          {record.verified_at && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
                              title={`Xác minh lúc ${formatTime(record.verified_at)}`}
                            >
                              <ShieldCheck size={12} />
                              Đã xác minh
                            </span>
                          )}
                        </div>
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
                                ? "Khiếu nại chưa xử lý"
                                : "Đã xử lý khiếu nại"}
                            </span>
                            <p className="mt-1 text-[11px] text-rose-600">
                              {record.complaint}
                            </p>
                          </div>
                        )}
                        {record.corrected_at && (
                          <p className="mt-1 max-w-56 text-[11px] text-slate-500">
                            Đã sửa giờ: {record.correction_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
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
                              Xác nhận
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
                                Xử lý khiếu nại
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
                              Sửa giờ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openComplaint(record)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <MessageSquareWarning size={13} />
                            {record.complaint ? "Sửa" : "Ghi"} khiếu nại
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
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
                  <h2 className="font-bold text-slate-900">Sửa giờ chấm công</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Bản ghi của {correctionTarget.label}. Giờ nhập theo múi giờ Việt Nam
                    (UTC+7) và lý do sửa là bắt buộc để lưu vết.
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeCorrection}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Giờ vào
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
                Giờ ra
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
              Trạng thái
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
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              Ghi chú
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
              Lý do sửa giờ <span className="text-rose-500">*</span>
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
                placeholder="Ví dụ: máy chấm công lỗi, nhân viên có báo trước khi vào ca."
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCorrection}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Hủy
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
                {savingCorrection ? "Đang lưu..." : "Lưu sửa giờ"}
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
                <h2 className="font-bold text-slate-900">Khiếu nại bảng công</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bản ghi của {complaintTarget.label}. Nội dung khiếu nại được lưu kèm thời
                  điểm gửi để quản lý đối soát.
                </p>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeComplaint}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {complaintTarget.existing && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                Khiếu nại hiện tại: {complaintTarget.existing}
              </p>
            )}

            <textarea
              value={complaintText}
              onChange={(event) => setComplaintText(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Ví dụ: máy chấm công không nhận diện được khuôn mặt nên em vào ca muộn 10 phút."
              className="mt-4 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeComplaint}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void submitComplaint()}
                disabled={savingComplaint || !complaintText.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingComplaint && <Loader2 size={13} className="animate-spin" />}
                {savingComplaint ? "Đang lưu..." : "Lưu khiếu nại"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}