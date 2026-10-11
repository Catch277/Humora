"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch, defaultBranchId } from "@/lib/domain/branchScope";
import {
  FACILITY_ASSET_CODE_PATTERN,
  FACILITY_CATEGORIES,
  FACILITY_CONDITIONS,
  MAX_FACILITY_CATEGORY_NAME_LENGTH,
  type Facility,
  type FacilityCategory,
  type FacilityCondition,
} from "@/lib/domain/entities/Facility";
import {
  branchAssetToken,
  nextFacilityAssetCode,
} from "@/lib/usecases/facilityAssetCode";

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch. SCRUM-67 needs
// `asset_prefix`: it is the number the asset codes of that branch start with.
type Branch = {
  id: string;
  name: string;
  manager_id: string | null;
  asset_prefix: number | null;
};

type FacilityForm = {
  branchId: string;
  name: string;
  /** A `code` of the organization's catalogue (SCRUM-65); the picker is built from it. */
  category: string;
  quantity: string;
  condition: FacilityCondition;
  lastCheckedAt: string;
  note: string;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; facility: Facility }
  | null;

type LoadResult = {
  facilities: Facility[];
  branches: Branch[];
  /** The organization's "Nhóm thiết bị" catalogue (SCRUM-65); empty when it could not be read. */
  categories: FacilityCategory[];
  error: string | null;
};

/**
 * The labels of the six groups SCRUM-45 shipped. Since SCRUM-65 the catalogue lives in the database
 * (`GET /api/facility-categories`), so this map is only the fallback: it labels a facility written before
 * that table existed, and it keeps the picker usable when the catalogue cannot be read at all.
 */
const CATEGORY_LABELS: Record<string, string> = {
  KITCHEN: "Khu pha chế",
  COLD_STORAGE: "Bảo quản lạnh",
  FURNITURE: "Nội thất",
  ELECTRICAL: "Thiết bị điện",
  CLEANING: "Vệ sinh",
  OTHER: "Khác",
};

const CONDITION_LABELS: Record<FacilityCondition, string> = {
  GOOD: "Hoạt động tốt",
  FAIR: "Cần theo dõi",
  MAINTENANCE: "Đang sửa chữa",
  BROKEN: "Hỏng, chờ xử lý",
};

const CONDITION_BADGES: Record<FacilityCondition, string> = {
  GOOD: "bg-emerald-50 text-emerald-700",
  FAIR: "bg-amber-50 text-amber-700",
  MAINTENANCE: "bg-blue-50 text-blue-700",
  BROKEN: "bg-rose-50 text-rose-700",
};

/** Values whose `condition` needs a maintenance action (SCRUM-46). */
const ATTENTION_CONDITIONS: FacilityCondition[] = ["MAINTENANCE", "BROKEN"];

const ALL = "all";
const PAGE_SIZE = 8;

const EMPTY_FORM: FacilityForm = {
  branchId: "",
  name: "",
  category: "KITCHEN",
  quantity: "1",
  condition: "GOOD",
  lastCheckedAt: "",
  note: "",
};

/** The field style shared by every control of both dialogs. */
const fieldClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500";

/** The same field, with the spacing a `<label>` block adds above its control. */
const inputClassName = `mt-1 ${fieldClassName}`;

/** Formats the `date` column (`YYYY-MM-DD`) without going through `Date`, so no timezone shifts it. */
function formatCheckedAt(value: string | null): string {
  if (!value) {
    return "Chưa kiểm tra";
  }

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function toForm(facility: Facility): FacilityForm {
  return {
    branchId: facility.branch_id,
    name: facility.name,
    category: facility.category,
    quantity: String(facility.quantity),
    condition: facility.condition,
    lastCheckedAt: facility.last_checked_at ?? "",
    note: facility.note ?? "",
  };
}

export default function FacilitiesPage() {
  // SCRUM-61: the inventory of a branch belongs to the branch head. The owner manages every branch;
  // a manager only their own, so the rows and the picker of another branch are read-only.
  const { profile, can } = useProfile();
  const viewerId = profile?.id ?? null;
  const managesAllBranches = can("branch:manage");

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  // The "Nhóm thiết bị" catalogue of the organization (SCRUM-65): the pickers are built from this.
  const [categories, setCategories] = useState<FacilityCategory[]>([]);

  // The branches this caller may write into (the owner all of them, a manager only their own).
  const manageableIds = new Set(
    branches
      .filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      )
      .map((branch) => branch.id),
  );
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string | typeof ALL>(ALL);
  const [conditionFilter, setConditionFilter] = useState<FacilityCondition | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FacilityForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  // The "Thêm nhóm thiết bị" dialog (SCRUM-65): its own state, because it adds a row to the catalogue
  // rather than editing the facility the other modal holds.
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead
  // of a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // The branch list feeds the "Chi nhánh" column and the modal picker; the category catalogue feeds
      // both "Nhóm thiết bị" pickers (SCRUM-65).
      const [facilitiesResponse, branchesResponse, categoriesResponse] =
        await Promise.all([
          fetch("/api/facilities", { cache: "no-store" }),
          fetch("/api/branches", { cache: "no-store" }),
          fetch("/api/facility-categories", { cache: "no-store" }),
        ]);

      // A catalogue that cannot be read is not a page error: the pickers fall back to the built-in six,
      // and adding a group answers its own message inside the category dialog.
      const categories = categoriesResponse.ok
        ? ((await categoriesResponse.json()) as FacilityCategory[])
        : [];

      if (!facilitiesResponse.ok) {
        const data = (await facilitiesResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          facilities: [],
          branches: [],
          categories,
          error: data?.error ?? "Không thể tải danh sách cơ sở vật chất.",
        };
      }

      return {
        facilities: (await facilitiesResponse.json()) as Facility[],
        branches: branchesResponse.ok
          ? ((await branchesResponse.json()) as Branch[])
          : [],
        categories,
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setFacilities(result.facilities);
        setBranches(result.branches);
        setCategories(result.categories);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFacilities([]);
        setBranches([]);
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

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => map.set(branch.id, branch.name));

    return map;
  }, [branches]);

  /**
   * The "Nhóm thiết bị" catalogue, with the six built-ins as the fallback when the database catalogue
   * could not be read (SCRUM-65) — an empty picker would make the screen unusable, and the built-ins are
   * still valid codes for every organization the seed has reached.
   */
  const categoryOptions = useMemo(
    () =>
      categories.length > 0
        ? categories.map((category) => ({
            code: category.code,
            name: category.name,
          }))
        : FACILITY_CATEGORIES.map((code) => ({ code, name: CATEGORY_LABELS[code] })),
    [categories],
  );

  /** A code as an operator reads it: the catalogue's name, the built-in label, or the code itself. */
  const categoryLabel = useCallback(
    (code: string): string =>
      categoryOptions.find((option) => option.code === code)?.name ??
      CATEGORY_LABELS[code] ??
      code,
    [categoryOptions],
  );

  /** The row being edited, if any: its own tag must not push the preview's number up (SCRUM-67). */
  const editingFacilityId = modal?.mode === "edit" ? modal.facility.id : "";

  /**
   * The code the API will generate for the selected branch (SCRUM-67): the screen already holds every
   * facility the caller may read, so the same rule the use case applies (`nextFacilityAssetCode()`) runs
   * here instead of a fixed example. It stays a preview — the server owns the number, and the saved row is
   * what the operator ends up seeing.
   */
  const assetCodePreview = useMemo(() => {
    const branch = branches.find((item) => item.id === form.branchId);

    if (!branch) {
      return "";
    }

    return nextFacilityAssetCode(
      branchAssetToken(branch),
      facilities
        .filter((facility) => facility.id !== editingFacilityId)
        .map((facility) => facility.code ?? ""),
    );
  }, [branches, facilities, form.branchId, editingFacilityId]);

  /**
   * The tag the edited row keeps: only while it is one this branch would still produce. A legacy
   * `DA_LAT-0001` (the first shape) or a serial typed before the field became read-only is replaced on
   * save, which is what `UpdateFacilityUseCase` does — so the field shows the code that will be stored,
   * not the one that is about to be replaced.
   */
  const storedAssetCode = modal?.mode === "edit" ? (modal.facility.code ?? "") : "";
  const keepsStoredAssetCode =
    modal?.mode === "edit" &&
    modal.facility.branch_id === form.branchId &&
    FACILITY_ASSET_CODE_PATTERN.test(storedAssetCode);
  const assetCodeField = keepsStoredAssetCode ? storedAssetCode : assetCodePreview;
  const assetCodeHint = keepsStoredAssetCode
    ? "Mã đang dùng được giữ nguyên — hệ thống cấp và không sửa được."
    : !assetCodePreview
      ? "Chọn chi nhánh để hệ thống cấp mã tài sản."
      : modal?.mode === "edit"
        ? `Hệ thống sẽ cấp mã mới cho chi nhánh này khi lưu — ${assetCodePreview}.`
        : `Hệ thống tự cấp mã theo chi nhánh khi lưu — ${assetCodePreview}.`;

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return facilities.filter((facility) => {
      if (branchFilter !== ALL && facility.branch_id !== branchFilter) {
        return false;
      }

      if (categoryFilter !== ALL && facility.category !== categoryFilter) {
        return false;
      }

      if (conditionFilter !== ALL && facility.condition !== conditionFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return `${facility.name} ${facility.code ?? ""} ${categoryLabel(facility.category)}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [facilities, query, branchFilter, categoryFilter, conditionFilter, categoryLabel]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleFacilities = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = (currentPage - 1) * PAGE_SIZE + visibleFacilities.length;

  const totalQuantity = facilities.reduce(
    (total, facility) => total + facility.quantity,
    0,
  );
  const attentionCount = facilities.filter((facility) =>
    ATTENTION_CONDITIONS.includes(facility.condition),
  ).length;
  const maintenanceCount = facilities.filter(
    (facility) => facility.condition === "MAINTENANCE",
  ).length;
  const goodCount = facilities.filter(
    (facility) => facility.condition === "GOOD",
  ).length;
  const branchCount = new Set(
    facilities.map((facility) => facility.branch_id),
  ).size;

  function openCreate() {
    // A manager adds equipment to their own branch by default; a manager who heads no branch gets no
    // default, so the save button stays disabled instead of offering a form the API would refuse.
    const preferred = defaultBranchId(branches, {
      userId: viewerId,
      managesAllBranches,
    });

    setForm({
      ...EMPTY_FORM,
      branchId: manageableIds.has(preferred) ? preferred : "",
    });
    setFormError("");
    setModal({ mode: "create" });
  }

  function openEdit(facility: Facility) {
    setForm(toForm(facility));
    setFormError("");
    setModal({ mode: "edit", facility });
  }

  function closeModal() {
    setModal(null);
    setFormError("");
  }

  function openCategoryDialog() {
    setCategoryName("");
    setCategoryError("");
    setCategoryDialogOpen(true);
  }

  function closeCategoryDialog() {
    setCategoryDialogOpen(false);
    setCategoryError("");
  }

  /**
   * Adds one group to the organization's catalogue (SCRUM-65) and makes it the choice of the facility form
   * that is (probably) open behind this dialog. `refresh()` follows, so the pickers show the server's
   * catalogue instead of a locally patched copy — and so the fallback six are replaced by the real list.
   */
  async function submitCategory() {
    const name = categoryName.trim();

    if (!name) {
      setCategoryError("Vui lòng nhập tên nhóm thiết bị.");
      return;
    }

    setCategorySaving(true);
    setCategoryError("");

    try {
      const response = await fetch("/api/facility-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setCategoryError(
          response.status === 409
            ? "Nhóm thiết bị này đã có trong danh mục."
            : (data?.error ?? "Không thể thêm nhóm thiết bị."),
        );
        return;
      }

      const created = (await response.json()) as FacilityCategory;
      setForm((value) => ({ ...value, category: created.code }));
      setCategoryDialogOpen(false);
      refresh();
    } catch {
      setCategoryError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function submit() {
    if (!form.branchId) {
      setFormError("Vui lòng chọn chi nhánh.");
      return;
    }

    if (!form.name.trim()) {
      setFormError("Vui lòng nhập tên thiết bị.");
      return;
    }

    const quantity = Number(form.quantity);
    const isEdit = modal?.mode === "edit";

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      setFormError("Số lượng phải là số nguyên từ 1 đến 9999.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await fetch(
        isEdit ? `/api/facilities/${modal.facility.id}` : "/api/facilities",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: form.branchId,
            name: form.name.trim(),
            category: form.category,
            quantity,
            condition: form.condition,
            last_checked_at: form.lastCheckedAt || null,
            note: form.note.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(data?.error ?? "Không thể lưu thông tin thiết bị.");
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

  async function remove(facility: Facility) {
    if (
      !window.confirm(
        `Xoá "${facility.name}" khỏi danh sách cơ sở vật chất? Thao tác này không thể hoàn tác.`,
      )
    ) {
      return;
    }

    setDeletingId(facility.id);
    setPageError("");

    try {
      const response = await fetch(`/api/facilities/${facility.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(data?.error ?? "Không thể xoá thiết bị.");
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
            Cơ sở hạ tầng / SCRUM-45
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cơ sở vật chất
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Danh mục thiết bị theo từng chi nhánh kèm tình trạng và ngày kiểm tra gần
            nhất.
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
          <button
            type="button"
            onClick={openCategoryDialog}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Tags size={14} /> Nhóm thiết bị
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
          >
            <Plus size={14} /> Thêm thiết bị
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Tổng thiết bị đang quản lý
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <PackageSearch size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {totalQuantity}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {goodCount} hạng mục hoạt động tốt
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Hạng mục cần xử lý
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <TriangleAlert size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {attentionCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            Đang sửa chữa hoặc hỏng
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Đang sửa chữa
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Wrench size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {maintenanceCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            Theo dõi tiến độ bảo trì
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
              Chi nhánh có thiết bị
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Building2 size={16} />
            </span>
          </div>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {branchCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
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
              aria-label="Tìm thiết bị"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên thiết bị, mã tài sản, nhóm thiết bị"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc theo chi nhánh"
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc theo nhóm thiết bị"
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>Tất cả nhóm thiết bị</option>
              {categoryOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setConditionFilter(ALL);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              conditionFilter === ALL
                ? "bg-blue-50 text-primary"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Tất cả tình trạng
          </button>
          {FACILITY_CONDITIONS.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => {
                setConditionFilter(condition);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                conditionFilter === condition
                  ? CONDITION_BADGES[condition]
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {CONDITION_LABELS[condition]}
            </button>
          ))}
          <p className="ml-auto text-[10px] text-slate-400">
            Hiển thị {rangeStart} – {rangeEnd} trên tổng số {filtered.length} hạng mục
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Thiết bị</th>
                <th className="px-4 py-3">Chi nhánh</th>
                <th className="px-4 py-3">Nhóm</th>
                <th className="px-4 py-3 text-right">Số lượng</th>
                <th className="px-4 py-3">Tình trạng</th>
                <th className="px-4 py-3">Kiểm tra gần nhất</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      Đang tải danh sách thiết bị...
                    </span>
                  </td>
                </tr>
              )}

              {!loading && visibleFacilities.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {query ||
                    branchFilter !== ALL ||
                    categoryFilter !== ALL ||
                    conditionFilter !== ALL
                      ? "Không tìm thấy thiết bị phù hợp"
                      : "Chưa có thiết bị nào được đăng ký"}
                  </td>
                </tr>
              )}

              {!loading &&
                visibleFacilities.map((facility) => (
                  <tr
                    key={facility.id}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                          <PackageSearch size={16} />
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {facility.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {facility.code ?? "Chưa gắn mã tài sản"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {branchNames.get(facility.branch_id) ?? "Chi nhánh đã xoá"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {categoryLabel(facility.category)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                      {facility.quantity}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          CONDITION_BADGES[facility.condition]
                        }`}
                      >
                        {CONDITION_LABELS[facility.condition]}
                      </span>
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-600">
                      {formatCheckedAt(facility.last_checked_at)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {manageableIds.has(facility.branch_id) ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(facility)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <Pencil size={13} /> Chỉnh sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(facility)}
                            disabled={deletingId === facility.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                          >
                            {deletingId === facility.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Xoá
                          </button>
                        </div>
                      ) : (
                        // SCRUM-61: this row belongs to a branch the caller does not head.
                        <span className="text-[11px] font-medium text-slate-400">
                          Chỉ xem
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
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
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={13} /> Trước
              </button>
              <button
                type="button"
                aria-label="Trang sau"
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage === pageCount}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Sau <ChevronRight size={13} />
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
                  <PackageSearch size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {modal.mode === "create"
                      ? "Thêm thiết bị vào chi nhánh"
                      : "Cập nhật thiết bị"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Thiết bị luôn thuộc một chi nhánh để phục vụ kiểm kê và bảo trì.
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeModal}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                Chi nhánh <span className="text-rose-500">*</span>
                <select
                  value={form.branchId}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, branchId: event.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">Chọn chi nhánh</option>
                  {branches.map((branch) => {
                    const manageable = manageableIds.has(branch.id);

                    return (
                      <option
                        key={branch.id}
                        value={branch.id}
                        // SCRUM-61: equipment belongs to a branch, so a manager may only pick their own.
                        disabled={manageableIds.size > 0 && !manageable}
                      >
                        {branch.asset_prefix ? `${String(branch.asset_prefix).padStart(2, "0")} · ` : ""}
                        {branch.name}
                        {manageable ? "" : " — chỉ xem"}
                      </option>
                    );
                  })}
                </select>
                {!manageableIds.has(form.branchId) && (
                  <span className="mt-1 block text-[11px] font-normal text-amber-600">
                    Bạn chỉ cập nhật thiết bị của chi nhánh mình phụ trách (chi nhánh trưởng).
                  </span>
                )}
                {modal.mode === "edit" && form.branchId !== modal.facility.branch_id && (
                  <span className="mt-1 block text-[11px] font-normal text-amber-600">
                    Chuyển sang chi nhánh khác sẽ cấp lại mã tài sản theo chi nhánh mới
                    {assetCodePreview ? ` (${assetCodePreview})` : ""} — tem cũ không còn đúng.
                  </span>
                )}
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                Tên thiết bị <span className="text-rose-500">*</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, name: event.target.value }))
                  }
                  maxLength={120}
                  placeholder="Máy pha cà phê Breville"
                  className={inputClassName}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="block text-xs font-semibold text-slate-600">
                  <label htmlFor="facility-code">Mã tài sản</label>
                  <input
                    id="facility-code"
                    value={assetCodeField}
                    // SCRUM-67: the tag is generated from the branch and is not a control any more — the
                    // field only states what will be stored (and what a printed label says).
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    placeholder="Hệ thống cấp khi lưu"
                    className={`${inputClassName} bg-slate-50 text-slate-500`}
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    {assetCodeHint}
                  </span>
                </div>

                <label className="block text-xs font-semibold text-slate-600">
                  Nhóm thiết bị
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      value={form.category}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          category: event.target.value,
                        }))
                      }
                      className={fieldClassName}
                    >
                      {/* The catalogue of the organization, plus the group being edited even when the
                          catalogue no longer lists it (`categoryOptions` is the fallback six then). */}
                      {form.category &&
                        !categoryOptions.some(
                          (option) => option.code === form.category,
                        ) && (
                          <option value={form.category}>
                            {categoryLabel(form.category)}
                          </option>
                        )}
                      {categoryOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {/* SCRUM-65: a group the six built-ins do not cover is added right here, so the
                        operator does not have to leave the form to finish it. */}
                    <button
                      type="button"
                      onClick={openCategoryDialog}
                      title="Thêm nhóm thiết bị"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={12} /> Thêm
                    </button>
                  </div>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Số lượng
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={form.quantity}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        quantity: event.target.value,
                      }))
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-600">
                  Tình trạng
                  <select
                    value={form.condition}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        condition: event.target.value as FacilityCondition,
                      }))
                    }
                    className={inputClassName}
                  >
                    {FACILITY_CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {CONDITION_LABELS[condition]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Ngày kiểm tra gần nhất
                <input
                  type="date"
                  value={form.lastCheckedAt}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      lastCheckedAt: event.target.value,
                    }))
                  }
                  className={inputClassName}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                Ghi chú
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, note: event.target.value }))
                  }
                  maxLength={500}
                  rows={3}
                  placeholder="Ví dụ: gioăng cao su yếu, cần thay trong tháng này"
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
                disabled={saving || !manageableIds.has(form.branchId)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Đang lưu..." : "Lưu thiết bị"}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Tags size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">Thêm nhóm thiết bị</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Nhóm thiết bị dùng chung cho cả tổ chức: sau khi thêm, nhóm này xuất hiện
                    trong bộ lọc và trong ô chọn nhóm khi thêm thiết bị.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={closeCategoryDialog}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                Tên nhóm <span className="text-rose-500">*</span>
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  maxLength={MAX_FACILITY_CATEGORY_NAME_LENGTH}
                  placeholder="Ví dụ: Máy móc"
                  className={inputClassName}
                />
              </label>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Nhóm hiện có
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {categoryOptions.map((option) => (
                    <span
                      key={option.code}
                      className="rounded-full border border-slate-200 bg-app px-2.5 py-1 text-[11px] text-slate-600"
                    >
                      {option.name}
                    </span>
                  ))}
                </div>
              </div>

              {categoryError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {categoryError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCategoryDialog}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void submitCategory()}
                disabled={categorySaving || categoryName.trim() === ""}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {categorySaving && <Loader2 size={13} className="animate-spin" />}
                {categorySaving ? "Đang lưu..." : "Thêm nhóm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
