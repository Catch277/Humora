import type { ContractPlan } from "@/lib/domain/entities/CustomerContract";
import {
  BILLING_CYCLES,
  CONTRACT_LIMITS,
  type RenewContractInput,
} from "@/lib/domain/entities/CustomerContract";
import {
  CUSTOMER_LIMITS,
  EMAIL_PATTERN,
  type CreateCustomerInput,
} from "@/lib/domain/entities/Customer";
import {
  CUSTOMER_EMAIL_LIMITS,
  type LogCustomerEmailInput,
} from "@/lib/domain/entities/CustomerEmail";
import type { CreateCustomerLeadInput, UpdateCustomerLeadInput } from "@/lib/domain/entities/CustomerLead";
import { LEAD_LIMITS } from "@/lib/domain/entities/CustomerLead";
import type { CustomerServiceInput } from "@/lib/domain/entities/CustomerService";
import {
  MAINTENANCE_VISIT_LIMITS,
  type CreateMaintenanceVisitInput,
} from "@/lib/domain/entities/MaintenanceVisit";
import {
  CUSTOMER_REMINDER_LIMITS,
  type LogReminderInput,
} from "@/lib/domain/entities/CustomerReminder";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { isGmailThreadUrl } from "@/lib/usecases/gmailLinks";

/**
 * The business rules the CRM's use cases own (SCRUM-101/102).
 *
 * One module rather than one file per assertion: every entry mirrors a CHECK of the two SQL scripts, so the
 * route layer stays a parser and the database stays a backstop. A sentence names its field, which is the
 * token `lib/i18n/serverMessages.ts` turns into a translated sentence on an English screen.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Round-trips a calendar date so `2026-02-31` is refused instead of rolling into March. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/** `""` from a form means "not filled", which the database stores as `null`. */
export function trimOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

function assertLength(
  field: string,
  value: string | null,
  max: number,
  min = 0,
): void {
  const length = value?.trim().length ?? 0;

  if (length < min || length > max) {
    throw new CrmInputError(
      min > 0
        ? `${field} phải từ ${min} đến ${max} ký tự.`
        : `${field} tối đa ${max} ký tự.`,
    );
  }
}

export function assertCustomerInput(input: CreateCustomerInput): void {
  assertLength(
    "companyName",
    input.companyName,
    CUSTOMER_LIMITS.companyName.max,
    CUSTOMER_LIMITS.companyName.min,
  );
  assertLength(
    "appName",
    input.appName,
    CUSTOMER_LIMITS.appName.max,
    CUSTOMER_LIMITS.appName.min,
  );

  if (!EMAIL_PATTERN.test(input.contactEmail.trim())) {
    throw new CrmInputError("contactEmail phải là một địa chỉ email hợp lệ.");
  }

  assertLength("contactName", input.contactName, CUSTOMER_LIMITS.contactName);
  assertLength("contactPhone", input.contactPhone, CUSTOMER_LIMITS.contactPhone);
  assertLength("address", input.address, CUSTOMER_LIMITS.address);
  assertLength("taxCode", input.taxCode, CUSTOMER_LIMITS.taxCode);
  assertLength("notes", input.notes, CUSTOMER_LIMITS.notes);
}

/** The fields create, update and renew share; the union keeps the three call sites aligned. */
export type ContractFields = {
  contractNo: string;
  planCode: ContractPlan;
  employeeCount: number;
  unitPrice: number;
  billingCycle: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  reminderDays: number;
  note: string | null;
};

export type ContractDraft = ContractFields & { customerId: string };

/** Shared by create, update and renew: the three actions accept exactly the same term fields. */
export function assertContractFields(input: ContractFields): void {
  assertLength(
    "contractNo",
    input.contractNo,
    CONTRACT_LIMITS.contractNo.max,
    CONTRACT_LIMITS.contractNo.min,
  );

  if (
    !Number.isInteger(input.employeeCount) ||
    input.employeeCount < CONTRACT_LIMITS.headcount.min ||
    input.employeeCount > CONTRACT_LIMITS.headcount.max
  ) {
    throw new CrmInputError(
      `employeeCount phải là số nguyên từ ${CONTRACT_LIMITS.headcount.min} đến ${CONTRACT_LIMITS.headcount.max}.`,
    );
  }

  if (
    !Number.isFinite(input.unitPrice) ||
    input.unitPrice < CONTRACT_LIMITS.unitPrice.min ||
    input.unitPrice > CONTRACT_LIMITS.unitPrice.max
  ) {
    throw new CrmInputError(
      `unitPrice phải nằm trong khoảng ${CONTRACT_LIMITS.unitPrice.min} đến ${CONTRACT_LIMITS.unitPrice.max} (VND/người/tháng).`,
    );
  }

  if (!(BILLING_CYCLES as readonly string[]).includes(input.billingCycle)) {
    throw new CrmInputError(
      "billingCycle phải là MONTHLY, QUARTERLY hoặc YEARLY.",
    );
  }

  if (!isCalendarDate(input.startDate)) {
    throw new CrmInputError("startDate phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  if (!isCalendarDate(input.endDate)) {
    throw new CrmInputError("endDate phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  if (input.endDate < input.startDate) {
    throw new CrmInputError("endDate phải bằng hoặc sau startDate.");
  }

  if (
    !Number.isInteger(input.reminderDays) ||
    input.reminderDays < CONTRACT_LIMITS.reminderDays.min ||
    input.reminderDays > CONTRACT_LIMITS.reminderDays.max
  ) {
    throw new CrmInputError(
      `reminderDays phải là số nguyên từ ${CONTRACT_LIMITS.reminderDays.min} đến ${CONTRACT_LIMITS.reminderDays.max}.`,
    );
  }

  assertLength("note", input.note, CONTRACT_LIMITS.note);
}

export function assertContractDraft(input: ContractDraft): void {
  if (!isUuid(input.customerId)) {
    throw new CrmInputError("customerId phải là UUID.");
  }

  assertContractFields(input);
}

export function assertRenewalInput(input: RenewContractInput): void {
  assertContractFields(input);
}

export function assertTerminationInput(
  terminatedOn: string,
  reason: string,
): void {
  if (!isCalendarDate(terminatedOn)) {
    throw new CrmInputError("terminatedOn phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  assertLength(
    "reason",
    reason,
    CONTRACT_LIMITS.terminationReason.max,
    CONTRACT_LIMITS.terminationReason.min,
  );
}

export function assertEmailInput(input: LogCustomerEmailInput): void {
  if (!isUuid(input.customerId)) {
    throw new CrmInputError("customerId phải là UUID.");
  }

  if (input.contractId !== null && !isUuid(input.contractId)) {
    throw new CrmInputError("contractId phải là UUID hoặc null.");
  }

  assertLength(
    "subject",
    input.subject,
    CUSTOMER_EMAIL_LIMITS.subject.max,
    CUSTOMER_EMAIL_LIMITS.subject.min,
  );

  if (!EMAIL_PATTERN.test(input.counterpartEmail.trim())) {
    throw new CrmInputError(
      "counterpartEmail phải là một địa chỉ email hợp lệ.",
    );
  }

  assertLength(
    "counterpartName",
    input.counterpartName,
    CUSTOMER_EMAIL_LIMITS.counterpartName,
  );

  if (input.gmailThreadUrl !== null && !isGmailThreadUrl(input.gmailThreadUrl)) {
    throw new CrmInputError(
      "gmailThreadUrl chỉ nhận liên kết https://mail.google.com/…",
    );
  }

  assertLength("gmailThreadId", input.gmailThreadId, CUSTOMER_EMAIL_LIMITS.gmailId);
  assertLength(
    "gmailMessageId",
    input.gmailMessageId,
    CUSTOMER_EMAIL_LIMITS.gmailId,
  );
  assertLength("snippet", input.snippet, CUSTOMER_EMAIL_LIMITS.snippet);
  assertLength("body", input.body, CUSTOMER_EMAIL_LIMITS.body);

  if (!isIsoTimestamp(input.sentAt)) {
    throw new CrmInputError("sentAt phải là thời điểm hợp lệ (ISO 8601).");
  }
}

export function assertServiceInput(input: CustomerServiceInput): void {
  if (!isUuid(input.customerId)) {
    throw new CrmInputError("customerId phải là UUID.");
  }

  if (input.contractId !== null && !isUuid(input.contractId)) {
    throw new CrmInputError("contractId phải là UUID hoặc null.");
  }

  assertLength("serviceName", input.serviceName, 120, 2);
  assertLength("serialNo", input.serialNo, 80);

  if (!isCalendarDate(input.warrantyStartOn)) {
    throw new CrmInputError("warrantyStartOn phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  if (
    !Number.isInteger(input.warrantyMonths) ||
    input.warrantyMonths < 0 ||
    input.warrantyMonths > 120
  ) {
    throw new CrmInputError("warrantyMonths phải là số nguyên từ 0 đến 120.");
  }

  if (
    !Number.isInteger(input.maintenanceIntervalMonths) ||
    input.maintenanceIntervalMonths < 0 ||
    input.maintenanceIntervalMonths > 60
  ) {
    throw new CrmInputError(
      "maintenanceIntervalMonths phải là số nguyên từ 0 đến 60.",
    );
  }

  assertLength("note", input.note, 1000);
}

export function assertVisitInput(input: CreateMaintenanceVisitInput): void {
  if (!isUuid(input.serviceId) || !isUuid(input.customerId)) {
    throw new CrmInputError("serviceId và customerId phải là UUID.");
  }

  if (!isCalendarDate(input.scheduledOn)) {
    throw new CrmInputError("scheduledOn phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  if (input.completedOn !== null && !isCalendarDate(input.completedOn)) {
    throw new CrmInputError("completedOn phải là ngày hợp lệ hoặc null.");
  }

  if (input.completedOn !== null && (input.summary?.trim().length ?? 0) < 3) {
    throw new CrmInputError(
      "summary là bắt buộc (ít nhất 3 ký tự) khi lần bảo trì đã hoàn tất.",
    );
  }

  assertLength(
    "technician",
    input.technician,
    MAINTENANCE_VISIT_LIMITS.technician,
  );
  assertLength("summary", input.summary, MAINTENANCE_VISIT_LIMITS.summary);

  if (
    !Number.isFinite(input.cost) ||
    input.cost < MAINTENANCE_VISIT_LIMITS.cost.min ||
    input.cost > MAINTENANCE_VISIT_LIMITS.cost.max
  ) {
    throw new CrmInputError("cost phải nằm trong khoảng 0 đến 1.000.000.000.");
  }
}

export function assertReminderInput(input: LogReminderInput): void {
  if (!isUuid(input.customerId)) {
    throw new CrmInputError("customerId phải là UUID.");
  }

  if (input.contractId !== null && !isUuid(input.contractId)) {
    throw new CrmInputError("contractId phải là UUID hoặc null.");
  }

  if (input.serviceId !== null && !isUuid(input.serviceId)) {
    throw new CrmInputError("serviceId phải là UUID hoặc null.");
  }

  if (input.contractId === null && input.serviceId === null) {
    throw new CrmInputError(
      "contractId hoặc serviceId là bắt buộc để biết nhắc việc gì.",
    );
  }

  if (!isCalendarDate(input.dueOn)) {
    throw new CrmInputError("dueOn phải là ngày hợp lệ (YYYY-MM-DD).");
  }

  assertLength("subject", input.subject, CUSTOMER_REMINDER_LIMITS.subject);
  assertLength("body", input.body, CUSTOMER_REMINDER_LIMITS.body);
  assertLength("note", input.note, CUSTOMER_REMINDER_LIMITS.note);
}

/** Yêu cầu demo / dùng thử (C3): công ty, người liên hệ và quy mô là đủ để gọi lại. */
export function assertLeadInput(input: CreateCustomerLeadInput): void {
  assertLength(
    "companyName",
    input.companyName,
    LEAD_LIMITS.companyName.max,
    LEAD_LIMITS.companyName.min,
  );

  if (!EMAIL_PATTERN.test(input.contactEmail.trim())) {
    throw new CrmInputError("contactEmail phải là một địa chỉ email hợp lệ.");
  }

  assertLength("contactName", input.contactName, LEAD_LIMITS.contactName);
  assertLength("contactPhone", input.contactPhone, LEAD_LIMITS.contactPhone);
  assertLength("planInterest", input.planInterest, LEAD_LIMITS.planInterest);
  assertLength("message", input.message, LEAD_LIMITS.message);
  assertLength("note", input.note, LEAD_LIMITS.note);

  if (
    input.employeeCount !== null &&
    (!Number.isInteger(input.employeeCount) ||
      input.employeeCount < LEAD_LIMITS.headcount.min ||
      input.employeeCount > LEAD_LIMITS.headcount.max)
  ) {
    throw new CrmInputError(
      `employeeCount phải là số nguyên từ ${LEAD_LIMITS.headcount.min} đến ${LEAD_LIMITS.headcount.max} hoặc null.`,
    );
  }
}

export function assertLeadPatchInput(input: UpdateCustomerLeadInput): void {
  assertLength("note", input.note, LEAD_LIMITS.note);

  if (input.convertedCustomerId !== null && !isUuid(input.convertedCustomerId)) {
    throw new CrmInputError("convertedCustomerId phải là UUID hoặc null.");
  }
}


