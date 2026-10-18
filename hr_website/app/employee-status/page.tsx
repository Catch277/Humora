"use client";

import {
  CalendarOff,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { roleLabel } from "@/lib/accessPolicy";
import { canManageBranch } from "@/lib/domain/branchScope";
import type {
  EmployeeStatus,
  EmployeeStatusValue,
} from "@/lib/domain/entities/EmployeeStatus";
import { formatDate, formatTime } from "@/lib/i18n/format";
import { employeeStatusLabel, geofenceLabel } from "@/lib/i18n/labels";
import { errorMessageFor } from "@/lib/i18n/serverMessages";

// SCRUM-63 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

type LoadResult = {
  statuses: EmployeeStatus[];
  updatedAt: string;
  workDate: string;
  /** Only sent on the first load of a filter change; the poll reuses the list already held. */
  branches?: Branch[];
  error: string | null;
};

const STATUS_BADGES: Record<EmployeeStatusValue, string> = {
  WORKING: "bg-emerald-50 text-emerald-700",
  NOT_STARTED: "bg-amber-50 text-amber-700",
  ON_LEAVE: "bg-blue-50 text-blue-700",
  FINISHED: "bg-teal-50 text-teal-700",
  NO_SHIFT: "bg-slate-100 text-slate-600",
  RESIGNED: "bg-slate-100 text-slate-500",
};

const ALL = "all";

/** The giám sát screens refresh themselves; design.md documents the 60s poll. */
const POLL_INTERVAL_MS = 60_000;

/** The check-in point is valid when it is inside the branch radius (SCRUM-22). */
function isInsideGeofence(status: EmployeeStatus): boolean | null {
  if (status.check_in_distance_m === null || status.attendance_radius === null) {
    return null;
  }

  return status.check_in_distance_m <= status.attendance_radius;
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function EmployeeStatusPage() {
  // SCRUM-63: the API already returns only the branches this caller runs, so the branch filter offers
  // the same set — a filter that could only ever answer "không có ai" would be a lie on screen.
  const { profile, can } = useProfile();
  const { locale, t } = useLocale();
  const viewerId = profile?.id ?? null;
  const managesAllBranches = can("branch:manage");

  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [workDate, setWorkDate] = useState("");

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead of
  // a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      const params = new URLSearchParams();

      if (branchFilter !== ALL) {
        params.set("branch_id", branchFilter);
      }

      const queryString = params.toString();

      const [statusResponse, branchesResponse] = await Promise.all([
        fetch(`/api/employee-status${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store",
        }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);

      if (!statusResponse.ok) {
        const data = (await statusResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          statuses: [],
          updatedAt: "",
          workDate: "",
          error: errorMessageFor(statusResponse.status, data, t),
        };
      }

      const payload = (await statusResponse.json()) as {
        updated_at?: string;
        work_date?: string;
        data?: EmployeeStatus[];
      };

      return {
        statuses: payload.data ?? [],
        updatedAt: payload.updated_at ?? "",
        workDate: payload.work_date ?? "",
        branches: branchesResponse.ok
          ? ((await branchesResponse.json()) as Branch[])
          : [],
        error: null,
      };
    }

    function apply(result: LoadResult) {
      if (cancelled) {
        return;
      }

      setStatuses(result.statuses);
      setUpdatedAt(result.updatedAt);
      setWorkDate(result.workDate);
      setBranches(result.branches ?? []);
      setPageError(result.error ?? "");
      setLoading(false);
    }

    function fail() {
      if (cancelled) {
        return;
      }

      setPageError(t("error.network"));
      setLoading(false);
    }

    load().then(apply).catch(fail);

    // A giám sát screen polls itself; the manual button only forces an extra refresh.
    const timer = setInterval(() => {
      load().then(apply).catch(fail);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [branchFilter, reloadToken, t]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  // A branch the caller does not head is not in the API's answer either, so the filter lists the same
  // branches the roster can contain (SCRUM-63).
  const scopedBranches = useMemo(
    () =>
      branches.filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      ),
    [branches, viewerId, managesAllBranches],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return statuses;
    }

    return statuses.filter((status) =>
      `${status.full_name} ${roleLabel(status.role, t)} ${status.branch_name ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
    // `t` belongs in the deps: the predicate searches a *localized* role label, so typing "manager" in
    // English mode must not keep matching against the Vietnamese one until an unrelated re-render.
  }, [statuses, query, t]);

  const workingCount = statuses.filter((s) => s.status === "WORKING").length;
  const notStartedCount = statuses.filter((s) => s.status === "NOT_STARTED").length;
  const onLeaveCount = statuses.filter((s) => s.status === "ON_LEAVE").length;
  const finishedCount = statuses.filter((s) => s.status === "FINISHED").length;
  const outsideCount = statuses.filter(
    (s) => isInsideGeofence(s) === false,
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("employeeStatus.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("employeeStatus.title")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t("employeeStatus.subtitle", { date: formatDate(workDate, locale) })}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-[10px] text-slate-500">
            <Clock3 size={12} className="text-slate-400" />
            {t("employeeStatus.updatedAt", { time: formatTime(updatedAt, locale, "--:--") })}
          </span>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("employeeStatus.working")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserCheck size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {workingCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            {t("employeeStatus.kpiWorkingNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("employeeStatus.notStarted")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock3 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {notStartedCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            {t("employeeStatus.kpiNotStartedNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("employeeStatus.onLeave")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <CalendarOff size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {onLeaveCount}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {t("employeeStatus.kpiFinishedNote", { count: finishedCount })}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              {t("employeeStatus.kpiOutside")}
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <MapPin size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {outsideCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            {t("employeeStatus.kpiOutsideNote")}
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
              aria-label={t("employeeStatus.searchAria")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("employeeStatus.searchPlaceholder")}
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("common.filterBranchAria")}
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>
                {managesAllBranches
                  ? t("common.allBranches")
                  : t("employeeStatus.allBranchesScoped")}
              </option>
              {scopedBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400">
              {managesAllBranches
                ? t("employeeStatus.count", { count: filtered.length })
                : t("employeeStatus.countScoped", { count: filtered.length })}
              {" · "}
              {t("employeeStatus.autoRefresh")}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("common.employee")}</th>
                <th className="px-4 py-3">{t("employeeStatus.columnBranch")}</th>
                <th className="px-4 py-3">{t("employeeStatus.columnShift")}</th>
                <th className="px-4 py-3">{t("employeeStatus.columnAttendance")}</th>
                <th className="px-4 py-3">{t("employeeStatus.columnLocation")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      {t("employeeStatus.loading")}
                    </span>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {statuses.length === 0
                      ? t("employeeStatus.emptyNoData")
                      : t("employeeStatus.emptyFiltered")}
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((status) => {
                  const inside = isInsideGeofence(status);

                  return (
                    <tr
                      key={status.employee_id}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-primary">
                            {initials(status.full_name)}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {status.full_name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {roleLabel(status.role, t)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {status.branch_name ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {status.shift_name ?? "—"}
                      </td>
                      <td className="px-4 py-4 tabular-nums text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} className="text-slate-400" />
                          {formatTime(status.check_in_at, locale, "--:--")} →{" "}
                          {formatTime(status.check_out_at, locale, "--:--")}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {inside === null ? (
                          <span className="text-[11px] text-slate-400">
                            {t("employeeStatus.noCoordinates")}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              inside
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {inside ? (
                              <ShieldCheck size={12} />
                            ) : (
                              <MapPin size={12} />
                            )}
                            {geofenceLabel(inside ? "INSIDE" : "OUTSIDE", t)}
                          </span>
                        )}
                        {status.check_in_distance_m !== null && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {status.check_in_distance_m} m
                            {status.attendance_radius !== null
                              ? ` / ${status.attendance_radius} m`
                              : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            STATUS_BADGES[status.status]
                          }`}
                        >
                          {employeeStatusLabel(status.status, t)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}