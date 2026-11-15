/**
 * Hợp đồng của một khách hàng (SCRUM-101, C4).
 *
 * Ba quyết định đáng nhớ:
 *
 * - **`monthly_fee` là cột sinh** (`price × headcount`, sàn 400.000 ₫). API chỉ gửi `unit_price` và
 *   `employee_count`; không client nào ghi được con số phí, nên phí và các phần của nó không thể lệch nhau.
 * - **`status` là ý định** (`DRAFT` soạn, `ACTIVE` đang chạy, `TERMINATED` đã chấm dứt). `EXPIRING` /
 *   `EXPIRED` là *suy ra* từ `end_date` + `reminder_days` (`effective_status`) và không bao giờ được lưu —
 *   dự án không có cron, nên một verdict lưu sẵn sẽ sai mỗi sáng không ai làm mới nó.
 * - **Gia hạn là một hợp đồng mới**, trỏ về hợp đồng cũ qua `renewsContractId`; hợp đồng cũ không bị sửa,
 *   nó chỉ tự đọc thành `EXPIRED` khi ngày kết thúc đã qua.
 */
export const CONTRACT_PLANS = ["BASIC", "ADVANCED", "PREMIUM"] as const;

export type ContractPlan = (typeof CONTRACT_PLANS)[number];

export const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** What the owner decided. Everything else is derived at read time. */
export const CONTRACT_INTENTS = ["DRAFT", "ACTIVE", "TERMINATED"] as const;

export type ContractIntent = (typeof CONTRACT_INTENTS)[number];

/** What a screen renders: the intent plus the two date verdicts. */
export const CONTRACT_EFFECTIVE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
] as const;

export type ContractEffectiveStatus =
  (typeof CONTRACT_EFFECTIVE_STATUSES)[number];

export interface Contract {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_no: string;
  plan_code: ContractPlan;
  employee_count: number;
  unit_price: number;
  /** Computed by the database; never sent by a client. */
  monthly_fee: number;
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  reminder_days: number;
  status: ContractIntent;
  terminated_on: string | null;
  termination_reason: string | null;
  renews_contract_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of `get_contract_overview()` — the contract plus what the screen needs to render it. */
export interface ContractOverview extends Contract {
  customer_name: string;
  app_name: string;
  contact_email: string;
  days_to_end: number;
  effective_status: ContractEffectiveStatus;
  cycle_months: number;
  period_amount: number;
  last_reminder_at: string | null;
  email_count: number;
}

/** Mirrors the CHECKs of `customer_contracts` so a bad body answers `400`, never a `500`. */
export const CONTRACT_LIMITS = {
  contractNo: { min: 2, max: 60 },
  headcount: { min: 1, max: 100000 },
  unitPrice: { min: 0, max: 10_000_000 },
  reminderDays: { min: 0, max: 365 },
  note: 1000,
  terminationReason: { min: 5, max: 300 },
} as const;

/** The quotation's floor, kept here for the dialog's hint only — the database is the authority. */
export const CONTRACT_MIN_MONTHLY_FEE = 400_000;

export interface CreateContractInput {
  customerId: string;
  contractNo: string;
  planCode: ContractPlan;
  employeeCount: number;
  unitPrice: number;
  billingCycle: BillingCycle;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  reminderDays: number;
  /** `DRAFT` for a quote not yet signed, `ACTIVE` for a deal that is live. */
  status: ContractIntent;
  note: string | null;
  /** Set by a renewal so the chain is visible; a plain create leaves it null. */
  renewsContractId: string | null;
}

export type UpdateContractInput = CreateContractInput & { id: string };

export interface RenewContractInput {
  contractId: string;
  contractNo: string;
  employeeCount: number;
  unitPrice: number;
  planCode: ContractPlan;
  billingCycle: BillingCycle;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  reminderDays: number;
  note: string | null;
}

export interface TerminateContractInput {
  id: string;
  terminatedOn: string;
  reason: string;
}

export interface ContractFilters {
  status?: ContractEffectiveStatus;
  customerId?: string;
  search?: string;
}

export function isContractPlan(value: unknown): value is ContractPlan {
  return (
    typeof value === "string" &&
    (CONTRACT_PLANS as readonly string[]).includes(value)
  );
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return (
    typeof value === "string" &&
    (BILLING_CYCLES as readonly string[]).includes(value)
  );
}

export function isContractEffectiveStatus(
  value: unknown,
): value is ContractEffectiveStatus {
  return (
    typeof value === "string" &&
    (CONTRACT_EFFECTIVE_STATUSES as readonly string[]).includes(value)
  );
}

/** Months a billing cycle covers, used to read `period_amount` next to the monthly figure. */
export function billingCycleMonths(cycle: BillingCycle): number {
  return cycle === "YEARLY" ? 12 : cycle === "QUARTERLY" ? 3 : 1;
}
