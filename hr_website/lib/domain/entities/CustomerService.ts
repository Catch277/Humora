/**
 * Dịch vụ đã bán cho một khách, kèm bảo hành và chu kỳ bảo trì (SCRUM-102, C5).
 *
 * `warranty_end_on` là **cột sinh** từ `warranty_start_on + warranty_months`: API không gửi ngày kết thúc
 * bảo hành, nên nó không thể lệch với thời hạn khách đã mua. Chu kỳ bảo trì (`maintenance_interval_months`)
 * để 0 nghĩa là dịch vụ không bảo trì định kỳ.
 *
 * Lần bảo trì gần nhất và lần tới là **suy ra** từ `customer_maintenance_visits` (RPC `get_maintenance_overview`),
 * không phải cột: sửa một lần bảo trì thì lần tới tự đổi theo.
 */
export const CUSTOMER_SERVICE_STATUSES = ["ACTIVE", "ENDED"] as const;

export type CustomerServiceStatus =
  (typeof CUSTOMER_SERVICE_STATUSES)[number];

export const WARRANTY_STATES = [
  "NONE",
  "IN_WARRANTY",
  "EXPIRING",
  "EXPIRED",
] as const;

export type WarrantyState = (typeof WARRANTY_STATES)[number];

export const MAINTENANCE_STATES = ["NONE", "OK", "DUE_SOON", "OVERDUE"] as const;

export type MaintenanceState = (typeof MAINTENANCE_STATES)[number];

export interface CustomerService {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_id: string | null;
  service_name: string;
  serial_no: string | null;
  warranty_start_on: string;
  warranty_months: number;
  /** Computed by the database; never sent by a client. */
  warranty_end_on: string;
  maintenance_interval_months: number;
  status: CustomerServiceStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of `get_maintenance_overview()`. */
export interface ServiceOverview extends CustomerService {
  customer_name: string;
  app_name: string;
  contact_email: string;
  contract_no: string | null;
  last_completed_on: string | null;
  next_due_on: string | null;
  next_planned_on: string | null;
  warranty_state: WarrantyState;
  maintenance_state: MaintenanceState;
}

export const CUSTOMER_SERVICE_LIMITS = {
  serviceName: { min: 2, max: 120 },
  serialNo: 80,
  warrantyMonths: { min: 0, max: 120 },
  intervalMonths: { min: 0, max: 60 },
  note: 1000,
} as const;

export interface CustomerServiceInput {
  customerId: string;
  contractId: string | null;
  serviceName: string;
  serialNo: string | null;
  warrantyStartOn: string;
  warrantyMonths: number;
  maintenanceIntervalMonths: number;
  status: CustomerServiceStatus;
  note: string | null;
}

export type UpdateCustomerServiceInput = CustomerServiceInput & { id: string };

export interface CustomerServiceFilters {
  customerId?: string;
  state?: MaintenanceState;
}

export function isCustomerServiceStatus(
  value: unknown,
): value is CustomerServiceStatus {
  return (
    typeof value === "string" &&
    (CUSTOMER_SERVICE_STATUSES as readonly string[]).includes(value)
  );
}

export function isMaintenanceState(value: unknown): value is MaintenanceState {
  return (
    typeof value === "string" &&
    (MAINTENANCE_STATES as readonly string[]).includes(value)
  );
}
