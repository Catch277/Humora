import type {
  BillingCycle,
  ContractPlan,
  CreateContractInput,
  RenewContractInput,
  UpdateContractInput,
} from "@/lib/domain/entities/CustomerContract";
import {
  BILLING_CYCLES,
  CONTRACT_PLANS,
} from "@/lib/domain/entities/CustomerContract";
import {
  CUSTOMER_STATUSES,
  type CreateCustomerInput,
  type CustomerStatus,
  type UpdateCustomerInput,
} from "@/lib/domain/entities/Customer";
import {
  EMAIL_DIRECTIONS,
  type LogCustomerEmailInput,
} from "@/lib/domain/entities/CustomerEmail";
import {
  CUSTOMER_SERVICE_STATUSES,
  type CustomerServiceInput,
} from "@/lib/domain/entities/CustomerService";
import {
  MAINTENANCE_VISIT_KINDS,
  type CreateMaintenanceVisitInput,
  type UpdateMaintenanceVisitInput,
} from "@/lib/domain/entities/MaintenanceVisit";
import {
  REMINDER_CHANNELS,
  REMINDER_KINDS,
  type LogReminderInput,
} from "@/lib/domain/entities/CustomerReminder";
import {
  LEAD_STATUSES,
  type CreateCustomerLeadInput,
  type LeadStatus,
  type UpdateCustomerLeadInput,
} from "@/lib/domain/entities/CustomerLead";
import {
  readBoolean,
  readEnum,
  readInteger,
  readNumber,
  readOptionalString,
  readOptionalUuid,
  readRequiredString,
  readUuid,
  UUID_PATTERN,
  type ParseResult,
} from "@/app/api/_lib/crmRequest";

/**
 * The bodies the CRM routes accept (SCRUM-101/102), parsed once for the handlers that share them.
 *
 * This is HTTP parsing, not business rules: a shape (`string`/`uuid`/`number`/enum) is answered here, and a
 * rule that a CHECK also states (an e-mail pattern, a date ordering, a 5-character reason) stays in
 * `lib/usecases/crmValidation.ts`. Every sentence names its field, which is the token
 * `lib/i18n/serverMessages.ts` translates.
 */
export function parseCustomerBody(
  body: Record<string, unknown>,
): ParseResult<CreateCustomerInput> {
  const companyName = readRequiredString(body, "companyName");
  if (!companyName.ok) return companyName;

  const appName = readRequiredString(body, "appName");
  if (!appName.ok) return appName;

  const contactEmail = readRequiredString(body, "contactEmail");
  if (!contactEmail.ok) return contactEmail;

  const contactName = readOptionalString(body, "contactName");
  if (!contactName.ok) return contactName;

  const contactPhone = readOptionalString(body, "contactPhone");
  if (!contactPhone.ok) return contactPhone;

  const address = readOptionalString(body, "address");
  if (!address.ok) return address;

  const taxCode = readOptionalString(body, "taxCode");
  if (!taxCode.ok) return taxCode;

  const status = readEnum<CustomerStatus>(
    body,
    "status",
    CUSTOMER_STATUSES,
    "PROSPECT",
  );
  if (!status.ok) return status;

  const notes = readOptionalString(body, "notes");
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      companyName: companyName.value,
      appName: appName.value,
      contactEmail: contactEmail.value,
      contactName: contactName.value,
      contactPhone: contactPhone.value,
      address: address.value,
      taxCode: taxCode.value,
      status: status.value,
      notes: notes.value,
    },
  };
}

/** `PUT /api/customers/[id]` replaces the record, so it takes the same body as a create. */
export function parseCustomerSaveBody(
  body: Record<string, unknown>,
): ParseResult<UpdateCustomerInput> {
  return parseCustomerBody(body);
}

/** The fields `POST /api/contracts`, `PATCH /api/contracts/[id]` and renew share. */
function readContractFields(body: Record<string, unknown>): ParseResult<{
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
  status: "DRAFT" | "ACTIVE";
  note: string | null;
}> {
  const customerId = readUuid(body, "customerId");
  if (!customerId.ok) return customerId;

  const contractNo = readRequiredString(body, "contractNo");
  if (!contractNo.ok) return contractNo;

  const planCode = readEnum<ContractPlan>(body, "planCode", CONTRACT_PLANS);
  if (!planCode.ok) return planCode;

  const employeeCount = readInteger(body, "employeeCount");
  if (!employeeCount.ok) return employeeCount;

  const unitPrice = readNumber(body, "unitPrice");
  if (!unitPrice.ok) return unitPrice;

  const billingCycle = readEnum<BillingCycle>(
    body,
    "billingCycle",
    BILLING_CYCLES,
    "MONTHLY",
  );
  if (!billingCycle.ok) return billingCycle;

  const startDate = readRequiredString(body, "startDate");
  if (!startDate.ok) return startDate;

  const endDate = readRequiredString(body, "endDate");
  if (!endDate.ok) return endDate;

  const autoRenew = readBoolean(body, "autoRenew", true);
  if (!autoRenew.ok) return autoRenew;

  const reminderDays = readInteger(body, "reminderDays", 30);
  if (!reminderDays.ok) return reminderDays;

  const status = readEnum<"DRAFT" | "ACTIVE">(
    body,
    "status",
    ["DRAFT", "ACTIVE"],
    "ACTIVE",
  );
  if (!status.ok) return status;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      customerId: customerId.value,
      contractNo: contractNo.value,
      planCode: planCode.value,
      employeeCount: employeeCount.value,
      unitPrice: unitPrice.value,
      billingCycle: billingCycle.value,
      startDate: startDate.value,
      endDate: endDate.value,
      autoRenew: autoRenew.value,
      reminderDays: reminderDays.value,
      status: status.value,
      note: note.value,
    },
  };
}

export function parseContractBody(
  body: Record<string, unknown>,
): ParseResult<CreateContractInput> {
  const fields = readContractFields(body);

  if (!fields.ok) {
    return fields;
  }

  return { ok: true, value: { ...fields.value, renewsContractId: null } };
}

export function parseContractPatchBody(
  id: string,
  body: Record<string, unknown>,
): ParseResult<UpdateContractInput> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, error: "id phải là UUID." };
  }

  const fields = readContractFields(body);

  if (!fields.ok) {
    return fields;
  }

  return {
    ok: true,
    value: { ...fields.value, id, renewsContractId: null },
  };
}

/** `POST /api/contracts/[id]/renew`: the same term fields, minus the customer (it comes from the old row). */
export function parseRenewBody(
  contractId: string,
  body: Record<string, unknown>,
): ParseResult<RenewContractInput> {
  const contractNo = readRequiredString(body, "contractNo");
  if (!contractNo.ok) return contractNo;

  const planCode = readEnum<ContractPlan>(body, "planCode", CONTRACT_PLANS);
  if (!planCode.ok) return planCode;

  const employeeCount = readInteger(body, "employeeCount");
  if (!employeeCount.ok) return employeeCount;

  const unitPrice = readNumber(body, "unitPrice");
  if (!unitPrice.ok) return unitPrice;

  const billingCycle = readEnum<BillingCycle>(
    body,
    "billingCycle",
    BILLING_CYCLES,
    "MONTHLY",
  );
  if (!billingCycle.ok) return billingCycle;

  const startDate = readRequiredString(body, "startDate");
  if (!startDate.ok) return startDate;

  const endDate = readRequiredString(body, "endDate");
  if (!endDate.ok) return endDate;

  const autoRenew = readBoolean(body, "autoRenew", true);
  if (!autoRenew.ok) return autoRenew;

  const reminderDays = readInteger(body, "reminderDays", 30);
  if (!reminderDays.ok) return reminderDays;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      contractId,
      contractNo: contractNo.value,
      planCode: planCode.value,
      employeeCount: employeeCount.value,
      unitPrice: unitPrice.value,
      billingCycle: billingCycle.value,
      startDate: startDate.value,
      endDate: endDate.value,
      autoRenew: autoRenew.value,
      reminderDays: reminderDays.value,
      note: note.value,
    },
  };
}

export function parseTerminateBody(
  body: Record<string, unknown>,
): ParseResult<{ terminatedOn: string; reason: string }> {
  const terminatedOn = readRequiredString(body, "terminatedOn");
  if (!terminatedOn.ok) return terminatedOn;

  const reason = readRequiredString(body, "reason");
  if (!reason.ok) return reason;

  return { ok: true, value: { terminatedOn: terminatedOn.value, reason: reason.value } };
}

export function parseEmailBody(
  body: Record<string, unknown>,
): ParseResult<LogCustomerEmailInput> {
  const customerId = readUuid(body, "customerId");
  if (!customerId.ok) return customerId;

  const contractId = readOptionalUuid(body, "contractId");
  if (!contractId.ok) return contractId;

  const direction = readEnum(body, "direction", EMAIL_DIRECTIONS, "OUTBOUND");
  if (!direction.ok) return direction;

  const subject = readRequiredString(body, "subject");
  if (!subject.ok) return subject;

  const counterpartEmail = readRequiredString(body, "counterpartEmail");
  if (!counterpartEmail.ok) return counterpartEmail;

  const counterpartName = readOptionalString(body, "counterpartName");
  if (!counterpartName.ok) return counterpartName;

  const gmailThreadId = readOptionalString(body, "gmailThreadId");
  if (!gmailThreadId.ok) return gmailThreadId;

  const gmailMessageId = readOptionalString(body, "gmailMessageId");
  if (!gmailMessageId.ok) return gmailMessageId;

  const gmailThreadUrl = readOptionalString(body, "gmailThreadUrl");
  if (!gmailThreadUrl.ok) return gmailThreadUrl;

  const sentAt =
    body.sentAt === undefined || body.sentAt === null
      ? { ok: true as const, value: new Date().toISOString() }
      : readRequiredString(body, "sentAt");
  if (!sentAt.ok) return sentAt;

  const snippet = readOptionalString(body, "snippet");
  if (!snippet.ok) return snippet;

  const emailBody = readOptionalString(body, "body");
  if (!emailBody.ok) return emailBody;

  return {
    ok: true,
    value: {
      customerId: customerId.value,
      contractId: contractId.value,
      direction: direction.value,
      subject: subject.value,
      counterpartEmail: counterpartEmail.value,
      counterpartName: counterpartName.value,
      gmailThreadId: gmailThreadId.value,
      gmailMessageId: gmailMessageId.value,
      gmailThreadUrl: gmailThreadUrl.value,
      sentAt: sentAt.value,
      snippet: snippet.value,
      body: emailBody.value,
    },
  };
}

export function parseServiceBody(
  body: Record<string, unknown>,
): ParseResult<CustomerServiceInput> {
  const customerId = readUuid(body, "customerId");
  if (!customerId.ok) return customerId;

  const contractId = readOptionalUuid(body, "contractId");
  if (!contractId.ok) return contractId;

  const serviceName = readRequiredString(body, "serviceName");
  if (!serviceName.ok) return serviceName;

  const serialNo = readOptionalString(body, "serialNo");
  if (!serialNo.ok) return serialNo;

  const warrantyStartOn = readRequiredString(body, "warrantyStartOn");
  if (!warrantyStartOn.ok) return warrantyStartOn;

  const warrantyMonths = readInteger(body, "warrantyMonths", 12);
  if (!warrantyMonths.ok) return warrantyMonths;

  const interval = readInteger(body, "maintenanceIntervalMonths", 6);
  if (!interval.ok) return interval;

  const status = readEnum(
    body,
    "status",
    CUSTOMER_SERVICE_STATUSES,
    "ACTIVE",
  );
  if (!status.ok) return status;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      customerId: customerId.value,
      contractId: contractId.value,
      serviceName: serviceName.value,
      serialNo: serialNo.value,
      warrantyStartOn: warrantyStartOn.value,
      warrantyMonths: warrantyMonths.value,
      maintenanceIntervalMonths: interval.value,
      status: status.value,
      note: note.value,
    },
  };
}

export function parseVisitBody(
  body: Record<string, unknown>,
): ParseResult<CreateMaintenanceVisitInput> {
  const serviceId = readUuid(body, "serviceId");
  if (!serviceId.ok) return serviceId;

  const customerId = readUuid(body, "customerId");
  if (!customerId.ok) return customerId;

  const scheduledOn = readRequiredString(body, "scheduledOn");
  if (!scheduledOn.ok) return scheduledOn;

  const completedOn = readOptionalString(body, "completedOn");
  if (!completedOn.ok) return completedOn;

  const kind = readEnum(body, "kind", MAINTENANCE_VISIT_KINDS, "MAINTENANCE");
  if (!kind.ok) return kind;

  const technician = readOptionalString(body, "technician");
  if (!technician.ok) return technician;

  const cost = readNumber(body, "cost", 0);
  if (!cost.ok) return cost;

  const summary = readOptionalString(body, "summary");
  if (!summary.ok) return summary;

  return {
    ok: true,
    value: {
      serviceId: serviceId.value,
      customerId: customerId.value,
      scheduledOn: scheduledOn.value,
      completedOn: completedOn.value,
      kind: kind.value,
      technician: technician.value,
      cost: cost.value,
      summary: summary.value,
    },
  };
}

/**
 * `PATCH /api/maintenance-visits/[id]`: every field is optional, and "omitted" must be distinguishable from
 * "cleared" (`null`) — the repository writes only the keys present here, so a reschedule cannot wipe the
 * technician by accident.
 */
export function parseVisitPatchBody(
  id: string,
  body: Record<string, unknown>,
): ParseResult<UpdateMaintenanceVisitInput> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, error: "id phải là UUID." };
  }

  const patch: UpdateMaintenanceVisitInput = { id };

  if (body.scheduledOn !== undefined) {
    if (typeof body.scheduledOn !== "string" || body.scheduledOn.trim() === "") {
      return { ok: false, error: "scheduledOn phải là ngày (YYYY-MM-DD)." };
    }

    patch.scheduledOn = body.scheduledOn.trim();
  }

  if (body.completedOn !== undefined) {
    if (body.completedOn !== null && typeof body.completedOn !== "string") {
      return { ok: false, error: "completedOn phải là ngày hoặc null." };
    }

    patch.completedOn =
      body.completedOn === null ? null : body.completedOn.trim() || null;
  }

  if (body.kind !== undefined) {
    const kind = readEnum(body, "kind", MAINTENANCE_VISIT_KINDS);

    if (!kind.ok) {
      return kind;
    }

    patch.kind = kind.value;
  }

  if (body.technician !== undefined) {
    if (body.technician !== null && typeof body.technician !== "string") {
      return { ok: false, error: "technician phải là chuỗi hoặc null." };
    }

    patch.technician =
      body.technician === null ? null : body.technician.trim() || null;
  }

  if (body.cost !== undefined) {
    if (typeof body.cost !== "number" || !Number.isFinite(body.cost)) {
      return { ok: false, error: "cost phải là số." };
    }

    patch.cost = body.cost;
  }

  if (body.summary !== undefined) {
    if (body.summary !== null && typeof body.summary !== "string") {
      return { ok: false, error: "summary phải là chuỗi hoặc null." };
    }

    patch.summary =
      body.summary === null ? null : body.summary.trim() || null;
  }

  return { ok: true, value: patch };
}

export function parseReminderBody(
  body: Record<string, unknown>,
): ParseResult<LogReminderInput> {
  const customerId = readUuid(body, "customerId");
  if (!customerId.ok) return customerId;

  const contractId = readOptionalUuid(body, "contractId");
  if (!contractId.ok) return contractId;

  const serviceId = readOptionalUuid(body, "serviceId");
  if (!serviceId.ok) return serviceId;

  const kind = readEnum(body, "kind", REMINDER_KINDS);
  if (!kind.ok) return kind;

  const dueOn = readRequiredString(body, "dueOn");
  if (!dueOn.ok) return dueOn;

  const channel = readEnum(body, "channel", REMINDER_CHANNELS, "EMAIL");
  if (!channel.ok) return channel;

  const subject = readOptionalString(body, "subject");
  if (!subject.ok) return subject;

  const reminderBody = readOptionalString(body, "body");
  if (!reminderBody.ok) return reminderBody;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      customerId: customerId.value,
      contractId: contractId.value,
      serviceId: serviceId.value,
      kind: kind.value,
      dueOn: dueOn.value,
      channel: channel.value,
      subject: subject.value,
      body: reminderBody.value,
      note: note.value,
    },
  };
}

/** `POST /api/leads` — một yêu cầu demo/dùng thử, thường chép lại từ form landing hoặc từ cuộc gọi. */
export function parseLeadBody(
  body: Record<string, unknown>,
): ParseResult<CreateCustomerLeadInput> {
  const companyName = readRequiredString(body, "companyName");
  if (!companyName.ok) return companyName;

  const contactEmail = readRequiredString(body, "contactEmail");
  if (!contactEmail.ok) return contactEmail;

  const contactName = readOptionalString(body, "contactName");
  if (!contactName.ok) return contactName;

  const contactPhone = readOptionalString(body, "contactPhone");
  if (!contactPhone.ok) return contactPhone;

  const employeeCount =
    body.employeeCount === undefined || body.employeeCount === null
      ? ({ ok: true, value: null } as const)
      : readInteger(body, "employeeCount");
  if (!employeeCount.ok) return employeeCount;

  const planInterest = readOptionalString(body, "planInterest");
  if (!planInterest.ok) return planInterest;

  const message = readOptionalString(body, "message");
  if (!message.ok) return message;

  const status = readEnum<LeadStatus>(body, "status", LEAD_STATUSES, "NEW");
  if (!status.ok) return status;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  const source = readOptionalString(body, "source");
  if (!source.ok) return source;

  return {
    ok: true,
    value: {
      companyName: companyName.value,
      contactName: contactName.value,
      contactEmail: contactEmail.value,
      contactPhone: contactPhone.value,
      employeeCount: employeeCount.value,
      planInterest: planInterest.value,
      message: message.value,
      source: source.value ?? "LANDING",
      status: status.value,
      note: note.value,
    },
  };
}

/** `PATCH /api/leads/[id]`: the conversation moves, the contact data does not. */
export function parseLeadPatchBody(
  id: string,
  body: Record<string, unknown>,
): ParseResult<UpdateCustomerLeadInput> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, error: "id phải là UUID." };
  }

  const status = readEnum<LeadStatus>(body, "status", LEAD_STATUSES);
  if (!status.ok) return status;

  const note = readOptionalString(body, "note");
  if (!note.ok) return note;

  const convertedCustomerId = readOptionalUuid(body, "convertedCustomerId");
  if (!convertedCustomerId.ok) return convertedCustomerId;

  return {
    ok: true,
    value: {
      status: status.value,
      note: note.value,
      convertedCustomerId: convertedCustomerId.value,
    },
  };
}



