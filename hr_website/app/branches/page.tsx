"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import LocationPickerMap from "@/components/LocationPickerMap";
import { useProfile } from "@/components/ProfileProvider";
import { roleLabel } from "@/lib/accessPolicy";
import { canManageBranch } from "@/lib/domain/branchScope";
import { isBranchHeadRole } from "@/lib/domain/roles";
import { isInsideVietnam } from "@/lib/geo/vietnam";
import {
  branchAssetToken,
  formatFacilityAssetCode,
} from "@/lib/usecases/facilityAssetCode";

type Branch = {
  id: string;
  name: string;
  /** SCRUM-67: the branch's own number, which prefixes every asset code of its facilities. */
  asset_prefix: number | null;
  address: string | null;
  manager_id: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius: number;
  created_at: string;
  updated_at: string;
};

type BranchForm = {
  name: string;
  address: string;
  managerId: string;
  latitude: string;
  longitude: string;
  attendanceRadius: string;
};

/**
 * A row of the staff directory (`GET /api/users` without `id`, SCRUM-24). The endpoint is a manager
 * view (SCRUM-59 `directory:view`), which is the PII decision recorded for this screen: a branch
 * manager is chosen from it, and a role without the directory simply does not get the list.
 */
type StaffOption = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type ModalState = { mode: "create" } | { mode: "edit"; branch: Branch } | null;

type LoadResult = { branches: Branch[]; error: string | null };

// Mirrors MIN_ATTENDANCE_RADIUS / MAX_ATTENDANCE_RADIUS / DEFAULT_ATTENDANCE_RADIUS in
// app/api/branches/_lib/branchRequest.ts.
const MIN_RADIUS = 10;
const MAX_RADIUS = 2000;
const DEFAULT_RADIUS = 50;

const PAGE_SIZE = 8;

const EMPTY_FORM: BranchForm = {
  name: "",
  address: "",
  managerId: "",
  latitude: "",
  longitude: "",
  attendanceRadius: String(DEFAULT_RADIUS),
};

const radiusFormatter = new Intl.NumberFormat("vi-VN");

function hasGeofence(branch: Branch): boolean {
  return branch.latitude !== null && branch.longitude !== null;
}

function formatGps(latitude: number | null, longitude: number | null): string {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return "Chưa cấu hình";
  }

  const latitudeLabel = `${Math.abs(latitude).toFixed(6)}° ${latitude >= 0 ? "N" : "S"}`;
  const longitudeLabel = `${Math.abs(longitude).toFixed(6)}° ${longitude >= 0 ? "E" : "W"}`;

  return `${latitudeLabel}, ${longitudeLabel}`;
}

/**
 * The first asset code the branch will issue (SCRUM-67), e.g. `01HSVH-0001`: the number is the branch's own
 * `asset_prefix` and the letters are the initials of its name, so the owner can see what a printed label
 * says before the inventory even exists. A branch without a number falls back to the bare acronym.
 */
function firstAssetCode(branch: Branch): string {
  return formatFacilityAssetCode(branchAssetToken(branch), 1);
}

function toForm(branch: Branch): BranchForm {
  return {
    name: branch.name,
    address: branch.address ?? "",
    managerId: branch.manager_id ?? "",
    latitude: branch.latitude === null ? "" : String(branch.latitude),
    longitude: branch.longitude === null ? "" : String(branch.longitude),
    attendanceRadius: String(branch.attendance_radius),
  };
}

export default function BranchesPage() {
  // SCRUM-59/61: a manager may open this screen (`branch:view`) and edit the branch they head
  // (`branch:update`); the owner manages every branch. The write controls follow that rule, so a row
  // the caller does not manage reads "Chỉ xem" instead of offering a button whose call answers `403`.
  const { profile, can } = useProfile();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  // The one rule from `lib/domain/branchScope.ts` the table reads per row (SCRUM-61).
  const viewer = {
    userId: profile?.id ?? null,
    managesAllBranches: can("branch:manage"),
  };
  const canManage = (branch: Branch) => canManageBranch(branch, viewer);

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead
  // of a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  // The manager picker — and the name in the table — needs the staff directory. A 403 is a normal
  // outcome (only a role holding `directory:view` may read it), so it is remembered as "not allowed"
  // instead of becoming a page error, and the screen keeps working with the Đã gán / Chưa gán badges.
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffAllowed, setStaffAllowed] = useState(false);

  // Reverse geocoding: which lookup is in flight, and what to tell the operator about the last one.
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressError, setAddressError] = useState("");
  const geocodeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/branches", { cache: "no-store" })
      .then(async (response): Promise<LoadResult> => {
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          return {
            branches: [],
            error: data?.error ?? "Không thể tải danh sách chi nhánh.",
          };
        }

        return { branches: (await response.json()) as Branch[], error: null };
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setBranches(result.branches);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setBranches([]);
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users", { cache: "no-store" })
      .then(async (response): Promise<StaffOption[]> => {
        if (!response.ok) {
          // 403 for a role without the directory: no picker, no name in the table, no error.
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

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff],
  );

  /**
   * The accounts that may head a branch: `MANAGER` and nobody else (SCRUM-63). The organization's
   * `OWNER` stands above every branch, so offering them here would pin one person to one chi nhánh; an
   * `EMPLOYEE` never had a scope. The API refuses both (`BranchManagerRoleError`) while `staff` itself
   * stays complete, so a legacy `manager_id` pointing at either of them still shows a name below.
   */
  const managerOptions = useMemo(
    () => staff.filter((member) => isBranchHeadRole(member.role)),
    [staff],
  );

  /**
   * Whether a stored `manager_id` still names somebody who may head a branch. Answering that needs the
   * directory, so an unavailable one answers `true`: the row keeps its badge instead of flagging every
   * branch in the table.
   */
  function hasValidHead(branch: Branch): boolean {
    if (!branch.manager_id) {
      return false;
    }

    if (staffById.size === 0) {
      return true;
    }

    return isBranchHeadRole(staffById.get(branch.manager_id)?.role);
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return branches;
    }

    return branches.filter((branch) =>
      `${branch.name} ${branch.address ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [branches, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleBranches = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = (currentPage - 1) * PAGE_SIZE + visibleBranches.length;

  const geofenceBranches = branches.filter(hasGeofence);
  const unassignedCount = branches.filter((branch) => !hasValidHead(branch)).length;
  const averageRadius =
    geofenceBranches.length === 0
      ? 0
      : Math.round(
          geofenceBranches.reduce(
            (total, branch) => total + branch.attendance_radius,
            0,
          ) / geofenceBranches.length,
        );

  const previewRadius = Number(form.attendanceRadius);
  const previewLatitude = form.latitude.trim() === "" ? null : Number(form.latitude);
  const previewLongitude =
    form.longitude.trim() === "" ? null : Number(form.longitude);
  const previewRadiusMeters =
    Number.isFinite(previewRadius) && previewRadius > 0 ? previewRadius : DEFAULT_RADIUS;

  /**
   * Fills the address field from a coordinate (`GET /api/geo/reverse`). Only one lookup runs at a
   * time: a newer pick aborts the previous one, so the address always belongs to the newest pin.
   */
  async function lookupAddress(latitude: number, longitude: number) {
    if (!isInsideVietnam(latitude, longitude)) {
      setAddressNotice("");
      setAddressError(
        "Không tra cứu được địa chỉ: toạ độ nằm ngoài lãnh thổ Việt Nam.",
      );
      return;
    }

    geocodeAbortRef.current?.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;

    setLocatingAddress(true);
    setAddressNotice("");
    setAddressError("");

    try {
      const response = await fetch(
        `/api/geo/reverse?latitude=${latitude}&longitude=${longitude}`,
        { cache: "no-store", signal: controller.signal },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setAddressError(
          data?.error ?? "Không tra cứu được địa chỉ. Vui lòng nhập tay.",
        );
        return;
      }

      const data = (await response.json()) as { address: string | null };
      const address = data.address;

      if (!address) {
        setAddressError(
          "Không tìm thấy địa chỉ cho toạ độ này. Vui lòng nhập tay.",
        );
        return;
      }

      setForm((value) => ({ ...value, address }));
      setAddressNotice("Đã điền địa chỉ theo toạ độ.");
    } catch (error) {
      // A lookup that was replaced by a newer one has nothing to report.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setAddressError(
        "Không kết nối được dịch vụ tra cứu địa chỉ. Vui lòng nhập tay.",
      );
    } finally {
      if (geocodeAbortRef.current === controller) {
        geocodeAbortRef.current = null;
        setLocatingAddress(false);
      }
    }
  }

  /** The same lookup, started from the button next to the address field. */
  function lookupAddressFromForm() {
    const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
    const longitude =
      form.longitude.trim() === "" ? null : Number(form.longitude);

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      setAddressNotice("");
      setAddressError("Cần nhập toạ độ hợp lệ trước khi tra cứu địa chỉ.");
      return;
    }

    void lookupAddress(latitude, longitude);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setAddressNotice("");
    setAddressError("");
    setModal({ mode: "create" });
  }

  function openEdit(branch: Branch) {
    const storedHead = branch.manager_id;
    // SCRUM-63: a head who may not head a branch (the owner, or a legacy employee) is not an option any
    // more, so the field opens empty instead of holding a value the API would refuse on save. Only the
    // owner may change `manager_id` at all, and an unavailable directory keeps the stored value, so a
    // manager's modal never blanks a head it cannot see.
    const clearInvalidHead =
      can("branch:manage") && storedHead !== null && !hasValidHead(branch);

    setForm({
      ...toForm(branch),
      managerId: clearInvalidHead ? "" : (storedHead ?? ""),
    });
    setFormError("");
    setAddressNotice("");
    setAddressError("");
    setModal({ mode: "edit", branch });
  }

  function closeModal() {
    // A lookup still running belongs to the form that is being closed.
    geocodeAbortRef.current?.abort();
    geocodeAbortRef.current = null;
    setLocatingAddress(false);
    setAddressNotice("");
    setAddressError("");
    setModal(null);
    setFormError("");
  }

  function applyCurrentLocation() {
    if (!navigator.geolocation) {
      setFormError("Thiết bị không hỗ trợ lấy vị trí GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        setForm((value) => ({
          ...value,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
        }));

        // The device just told us where it is, so it may as well tell us the address too.
        void lookupAddress(latitude, longitude);
      },
      () => setFormError("Không lấy được vị trí hiện tại. Vui lòng nhập tay."),
    );
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError("Vui lòng nhập tên chi nhánh.");
      return;
    }

    const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
    const longitude =
      form.longitude.trim() === "" ? null : Number(form.longitude);
    const radius = Number(form.attendanceRadius);

    if (latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) {
      setFormError("Vĩ độ phải là số trong khoảng -90 đến 90.");
      return;
    }

    if (
      longitude !== null &&
      (!Number.isFinite(longitude) || Math.abs(longitude) > 180)
    ) {
      setFormError("Kinh độ phải là số trong khoảng -180 đến 180.");
      return;
    }

    if ((latitude === null) !== (longitude === null)) {
      setFormError("Cần nhập đủ cả vĩ độ và kinh độ để tạo vùng chấm công.");
      return;
    }

    // The same outline test the API and the map picker use, so a hand-typed pair is refused before
    // it becomes a request the server would answer with 400.
    if (latitude !== null && longitude !== null && !isInsideVietnam(latitude, longitude)) {
      setFormError(
        "Toạ độ phải nằm trong lãnh thổ Việt Nam. Vui lòng chọn lại vị trí trên bản đồ.",
      );
      return;
    }

    if (!Number.isInteger(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
      setFormError(
        `Bán kính chấm công phải là số nguyên từ ${MIN_RADIUS} đến ${MAX_RADIUS} mét.`,
      );
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const isEdit = modal?.mode === "edit";
      const response = await fetch(
        isEdit ? `/api/branches/${modal.branch.id}` : "/api/branches",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            address: form.address.trim() || null,
            // The API refuses a manager id it cannot resolve, so an empty selection is sent as null.
            manager_id: form.managerId || null,
            latitude,
            longitude,
            attendance_radius: radius,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(data?.error ?? "Không thể lưu thông tin chi nhánh.");
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

  async function remove(branch: Branch) {
    const confirmed = window.confirm(
      `Xoá chi nhánh "${branch.name}"?\n\nChỉ xoá được khi chi nhánh không còn bảng công, ca làm việc, thiết bị hay doanh thu nào — nếu còn, hệ thống sẽ liệt kê số lượng cần xử lý trước.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(branch.id);
    setPageError("");

    try {
      const response = await fetch(`/api/branches/${branch.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The 409 sentence names the rows that still point at the branch, so the owner knows what to
        // move or remove first (`branches_guard_delete` repeats that check in the database).
        setPageError(data?.error ?? "Không thể xoá chi nhánh.");
        return;
      }

      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Cơ sở hạ tầng / SCRUM-47
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý chi nhánh
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Cấu hình thông tin cơ sở và vùng bán kính chấm công định vị GPS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </button>
          {can("branch:manage") && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
            >
              <Plus size={14} /> Thêm chi nhánh
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Tổng số chi nhánh
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <Building2 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {branches.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Đang quản lý trên hệ thống
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đã cấu hình vùng GPS
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <MapPin size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {geofenceBranches.length}/{branches.length}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            Sẵn sàng cho chấm công định vị
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-teal-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Bán kính chấm công TB
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Radar size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {radiusFormatter.format(averageRadius)} m
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Áp dụng cho các chi nhánh có GPS
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Chưa gán chi nhánh trưởng
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <UserX size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {unassignedCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            Cần bổ sung quản lý phụ trách
          </p>
        </article>
      </div>

      {pageError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 md:flex-row md:items-center md:justify-between">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs md:w-80">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              aria-label="Tìm chi nhánh"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên, địa chỉ chi nhánh, địa bàn"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
          <p className="text-[10px] text-slate-400">
            Hiển thị {rangeStart} – {rangeEnd} trên tổng số {filtered.length} chi
            nhánh
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Chi nhánh</th>
                <th className="px-4 py-3">Chi nhánh trưởng</th>
                <th className="px-4 py-3">Toạ độ GPS</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Bán kính chấm công
                </th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      Đang tải danh sách chi nhánh...
                    </span>
                  </td>
                </tr>
              )}

              {!loading && visibleBranches.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    {query ? "Không tìm thấy kết quả nào" : "Chưa có chi nhánh nào"}
                  </td>
                </tr>
              )}

              {!loading &&
                visibleBranches.map((branch) => {
                  const manager = branch.manager_id
                    ? (staffById.get(branch.manager_id) ?? null)
                    : null;

                  return (
                    <tr
                      key={branch.id}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                            <Building2 size={16} />
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {branch.name}
                            </p>
                            <p className="mt-0.5 max-w-[20rem] break-words text-[11px] text-slate-500">
                              {branch.address ?? "Chưa cập nhật địa chỉ"}
                            </p>
                            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Mã tài sản {firstAssetCode(branch)}
                              {branch.asset_prefix
                                ? ` · số ${String(branch.asset_prefix).padStart(2, "0")}`
                                : " · chưa có số thứ tự"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {manager ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-800">
                              {manager.full_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {roleLabel(manager.role)}
                            </span>
                            {!hasValidHead(branch) && (
                              // SCRUM-63: the owner stands above every branch, so an owner-headed row
                              // is a branch nobody actually runs — the operator has to notice it.
                              <span className="max-w-48 text-[10px] font-semibold text-amber-600">
                                {roleLabel(manager.role)} không phụ trách chi nhánh — cần gán
                                quản lý chi nhánh
                              </span>
                            )}
                          </span>
                        ) : branch.manager_id ? (
                          // Without the directory the row shows the state, not the name.
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            Đã gán
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            Chưa gán
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-600">
                        {formatGps(branch.latitude, branch.longitude)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-slate-700">
                        {radiusFormatter.format(branch.attendance_radius)} m
                      </td>
                      <td className="px-4 py-4">
                        {hasGeofence(branch) ? (
                          <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                            Sẵn sàng chấm công
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            Thiếu toạ độ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {can("branch:update") && canManage(branch) ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(branch)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Pencil size={13} /> Chỉnh sửa
                            </button>
                            {can("branch:manage") && (
                              <button
                                type="button"
                                onClick={() => void remove(branch)}
                                disabled={deletingId === branch.id}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                              >
                                {deletingId === branch.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                                Xoá
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400">
                            Chỉ xem
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-[10px] text-slate-400">
              Trang {currentPage} / {pageCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Trang trước"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (number) => (
                  <button
                    key={number}
                    type="button"
                    onClick={() => setPage(number)}
                    className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                      number === currentPage
                        ? "bg-primary text-white"
                        : "border border-slate-200 bg-surface text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {number}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="Trang sau"
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Building2 size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {modal.mode === "create"
                      ? "Thêm mới Chi nhánh hoạt động"
                      : "Cập nhật Chi nhánh"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Cấu hình thông tin cơ sở và vùng bán kính chấm công định vị
                    tinh GPS.
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeModal}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {modal.mode === "edit" && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-normal text-slate-600">
                  Mã tài sản của chi nhánh này bắt đầu bằng{" "}
                  <span className="font-semibold">
                    {firstAssetCode(modal.branch)}
                  </span>
                  {modal.branch.asset_prefix
                    ? " — số thứ tự được cấp khi chi nhánh được tạo và không đổi khi đổi tên."
                    : " — chi nhánh này chưa có số thứ tự, chạy SCRUM-67 để cấp."}
                </p>
              )}
              <label className="block text-xs font-semibold text-slate-600">
                Tên chi nhánh <span className="text-rose-500">*</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, name: event.target.value }))
                  }
                  maxLength={120}
                  placeholder="Chi nhánh Quận 1 - Flagship Bến Thành"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
                />
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Địa chỉ đầy đủ
                  </p>
                  <button
                    type="button"
                    onClick={lookupAddressFromForm}
                    disabled={locatingAddress}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                  >
                    {locatingAddress ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <MapPinned size={12} />
                    )}
                    {locatingAddress ? "Đang tra cứu..." : "Lấy địa chỉ từ toạ độ"}
                  </button>
                </div>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      address: event.target.value,
                    }))
                  }
                  maxLength={300}
                  placeholder="128 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh"
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500"
                />
                {/* Reverse geocoding fills this field whenever the pin moves; a typed address stays editable. */}
                <p className="mt-1 text-[11px] text-slate-400">
                  Chọn vị trí trên bản đồ hoặc “Lấy vị trí hiện tại” để hệ thống
                  tự điền địa chỉ theo toạ độ.
                </p>
                {addressNotice && (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-600">
                    {addressNotice}
                  </p>
                )}
                {addressError && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-600">
                    {addressError}
                  </p>
                )}
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Chi nhánh trưởng
                <select
                  value={form.managerId}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      managerId: event.target.value,
                    }))
                  }
                  disabled={staffLoading || !staffAllowed || !can("branch:manage")}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-surface p-2.5 text-sm font-normal outline-none focus:border-blue-500 disabled:text-slate-400"
                >
                  <option value="">— Chưa gán —</option>
                  {managerOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name} — {roleLabel(member.role)}
                      {member.is_active ? "" : " (đã nghỉ)"}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-400">
                  {!can("branch:manage")
                    ? "Chỉ chủ sở hữu mới đổi được chi nhánh trưởng; bạn sửa được thông tin của chi nhánh mình phụ trách."
                    : staffLoading
                      ? "Đang tải danh sách nhân sự..."
                      : staffAllowed
                        ? "Người phụ trách chi nhánh — chỉ tài khoản quản lý chi nhánh; có thể để trống. Chủ sở hữu đứng trên mọi chi nhánh nên không phụ trách một chi nhánh cụ thể."
                        : "Chỉ chủ sở hữu/quản lý mới xem được danh sách nhân sự để gán chi nhánh trưởng."}
                </span>
                {modal.mode === "edit" &&
                  modal.branch.manager_id !== null &&
                  !hasValidHead(modal.branch) && (
                    <span className="mt-1 block text-[11px] font-normal text-amber-600">
                      Chi nhánh trưởng hiện tại là chủ sở hữu hoặc một tài khoản không thể phụ
                      trách chi nhánh, nên ô này đã được để trống — chọn một quản lý chi nhánh
                      rồi lưu lại.
                    </span>
                  )}
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">
                    Toạ độ định vị GPS <span className="text-rose-500">*</span>
                  </p>
                  <button
                    type="button"
                    onClick={applyCurrentLocation}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                  >
                    <MapPin size={12} /> Lấy vị trí hiện tại
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Vĩ độ (Lat)
                    <input
                      value={form.latitude}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          latitude: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="10.772500"
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal tabular-nums text-slate-800 outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Kinh độ (Long)
                    <input
                      value={form.longitude}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          longitude: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="106.698000"
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal tabular-nums text-slate-800 outline-none focus:border-blue-500"
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">
                    Bán kính chấm công cho phép (Geo-Fence)
                  </p>
                  <p className="text-[11px] font-semibold text-primary">
                    {radiusFormatter.format(
                      Number.isFinite(previewRadius) ? previewRadius : 0,
                    )}{" "}
                    mét
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    aria-label="Bán kính chấm công (mét)"
                    min={MIN_RADIUS}
                    max={MAX_RADIUS}
                    step={10}
                    value={form.attendanceRadius}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        attendanceRadius: event.target.value,
                      }))
                    }
                    className="w-24 rounded-lg border border-slate-200 p-2.5 text-sm tabular-nums outline-none focus:border-blue-500"
                  />
                  <input
                    type="range"
                    aria-label="Bán kính chấm công"
                    min={MIN_RADIUS}
                    max={MAX_RADIUS}
                    step={10}
                    value={
                      Number.isFinite(previewRadius) ? previewRadius : MIN_RADIUS
                    }
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        attendanceRadius: event.target.value,
                      }))
                    }
                    className="h-1.5 flex-1 accent-primary"
                  />
                </div>
                <p className="mt-2 rounded-lg border border-slate-100 bg-app p-2.5 text-[11px] text-slate-500">
                  Ngoài bán kính{" "}
                  {radiusFormatter.format(
                    Number.isFinite(previewRadius) ? previewRadius : 0,
                  )}
                  m tính từ tâm chi nhánh, hệ thống sẽ không ghi nhận chấm công
                  GPS.
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  Vị trí chi nhánh và vùng chấm công
                </p>
                <LocationPickerMap
                  latitude={previewLatitude}
                  longitude={previewLongitude}
                  radiusMeters={previewRadiusMeters}
                  onPick={(pickedLatitude, pickedLongitude) => {
                    setForm((value) => ({
                      ...value,
                      latitude: pickedLatitude.toFixed(6),
                      longitude: pickedLongitude.toFixed(6),
                    }));

                    // The pin moved, so the address follows it.
                    void lookupAddress(pickedLatitude, pickedLongitude);
                  }}
                />
              </div>

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
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Đang lưu..." : "Lưu thông tin chi nhánh"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

