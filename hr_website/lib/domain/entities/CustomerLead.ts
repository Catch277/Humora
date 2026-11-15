/**
 * Yêu cầu demo / dùng thử (SCRUM-101, C3) — hàng đợi chứ không phải khách hàng.
 *
 * Người điền form ở landing site đang *quan tâm*, chưa trả tiền: trộn hàng này vào `customers` sẽ làm mọi
 * KPI khách hàng và mọi truy vấn hợp đồng phải nhớ thêm một cờ. Vì vậy nó là bảng riêng, chỉ chủ sở hữu đọc,
 * và việc "chuyển thành khách" là một quyết định riêng (`converted_customer_id` ghi lại khách nào).
 */
export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "DEMO_SCHEDULED",
  "CONVERTED",
  "REJECTED",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface CustomerLead {
  id: string;
  organization_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  employee_count: number | null;
  plan_interest: string | null;
  message: string | null;
  source: string;
  status: LeadStatus;
  received_at: string;
  converted_customer_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const LEAD_LIMITS = {
  companyName: { min: 2, max: 160 },
  contactName: 120,
  contactPhone: 40,
  headcount: { min: 1, max: 100000 },
  planInterest: 40,
  message: 2000,
  note: 1000,
} as const;

export interface CreateCustomerLeadInput {
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  employeeCount: number | null;
  planInterest: string | null;
  message: string | null;
  source: string;
  status: LeadStatus;
  note: string | null;
}

export interface UpdateCustomerLeadInput {
  status: LeadStatus;
  note: string | null;
  convertedCustomerId: string | null;
}

export interface CustomerLeadFilters {
  status?: LeadStatus;
  search?: string;
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}
