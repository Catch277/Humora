import type {
  CustomerReminderLog,
  LogReminderInput,
  ReminderChannel,
  ReminderKind,
} from "@/lib/domain/entities/CustomerReminder";
import type { ICustomerReminderRepository } from "@/lib/domain/repositories/ICustomerReminderRepository";
import { throwCrmError } from "@/lib/infrastructure/repositories/crmErrors";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const REMINDER_COLUMNS =
  "id, organization_id, customer_id, contract_id, service_id, kind, due_on, channel, subject, body, sent_at, note";

type ReminderRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_id: string | null;
  service_id: string | null;
  kind: string;
  due_on: string;
  channel: string;
  subject: string | null;
  body: string | null;
  sent_at: string;
  note: string | null;
};

function toReminder(row: ReminderRow): CustomerReminderLog {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    contract_id: row.contract_id,
    service_id: row.service_id,
    kind: row.kind as ReminderKind,
    due_on: row.due_on,
    channel: row.channel as ReminderChannel,
    subject: row.subject,
    body: row.body,
    sent_at: row.sent_at,
    note: row.note,
  };
}

/**
 * Supabase implementation of the reminder trail (SCRUM-102).
 *
 * `customer_reminder_logs` is append-only by policy: this class has no update and no delete on purpose, so
 * "what the customer was told" cannot be rewritten. The unique index per item per day is what turns a double
 * click into a `409` instead of two rows.
 */
export class SupabaseCustomerReminderRepository
  implements ICustomerReminderRepository
{
  async logs(customerId?: string): Promise<CustomerReminderLog[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("customer_reminder_logs")
      .select(REMINDER_COLUMNS)
      .order("sent_at", { ascending: false });

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data, error } = await query;

    if (error) {
      throwCrmError(error, "load the reminder log");
    }

    return ((data ?? []) as ReminderRow[]).map(toReminder);
  }

  async log(input: LogReminderInput): Promise<CustomerReminderLog> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_reminder_logs")
      .insert({
        customer_id: input.customerId,
        contract_id: input.contractId,
        service_id: input.serviceId,
        kind: input.kind,
        due_on: input.dueOn,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        note: input.note,
      })
      .select(REMINDER_COLUMNS)
      .single();

    if (error) {
      throwCrmError(error, "log the reminder");
    }

    return toReminder(data as ReminderRow);
  }
}
