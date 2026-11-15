/**
 * Khách hàng của tổ chức (SCRUM-101) — một công ty đã mua phần mềm, không phải nhân viên và không phải
 * chi nhánh.
 *
 * `app_name` là "Tên App đăng ký" trong bảng khách hàng của C4: mỗi khách chạy một bản app riêng, nên tên
 * đó song song với `company_name` chứ không thay thế nó (hai công ty có thể cùng tên app do đặt trùng).
 *
 * Trạng thái là ý định của chủ sở hữu (`PROSPECT` đang thương lượng, `ACTIVE` đang dùng, `SUSPENDED` tạm
 * dừng, `CHURNED` đã rời). "Còn hạn hay không" **không** nằm ở đây — nó thuộc từng hợp đồng và được suy ra
 * từ `end_date` (xem `CustomerContract`).
 */
export const CUSTOMER_STATUSES = [
  "PROSPECT",
  "ACTIVE",
  "SUSPENDED",
  "CHURNED",
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: string;
  organization_id: string;
  company_name: string;
  app_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  address: string | null;
  tax_code: string | null;
  status: CustomerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Một dòng của `/customers`: khách + ba con số đọc từ `get_customer_overview()`. Chúng là **suy ra**
 * (hợp đồng còn hiệu lực, tổng phí tháng, ngày hết hạn gần nhất) nên không có cột nào trong bảng khách.
 */
export interface CustomerOverview extends Customer {
  active_contracts: number;
  monthly_total: number;
  next_end_date: string | null;
}

/** Biên mirror đúng các CHECK của `SCRUM-101_customers_contracts.sql`. */
export const CUSTOMER_LIMITS = {
  companyName: { min: 2, max: 160 },
  appName: { min: 1, max: 80 },
  contactName: 120,
  contactPhone: 40,
  address: 300,
  taxCode: 40,
  notes: 1000,
} as const;

/** What a screen submits. Optional text fields are `null` when cleared, never `""`. */
export interface CreateCustomerInput {
  companyName: string;
  appName: string;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
  taxCode: string | null;
  status: CustomerStatus;
  notes: string | null;
}

/** A save replaces the record, the same contract `PUT /api/branches/[id]` uses. */
export type UpdateCustomerInput = CreateCustomerInput;

export interface CustomerFilters {
  search?: string;
  status?: CustomerStatus;
}

export function isCustomerStatus(value: unknown): value is CustomerStatus {
  return (
    typeof value === "string" &&
    (CUSTOMER_STATUSES as readonly string[]).includes(value)
  );
}

/** The one shape check the API and the SQL CHECK agree on, so a bad address never reaches Postgres. */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
