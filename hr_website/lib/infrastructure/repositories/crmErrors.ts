import { CrmConflictError } from "@/lib/domain/errors/CrmConflictError";
import { CrmForbiddenError } from "@/lib/domain/errors/CrmForbiddenError";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";

type PostgrestLikeError = {
  code?: string;
  message: string;
  details?: string | null;
};

/**
 * Turns what PostgREST answered into the CRM's own four errors (SCRUM-101/102).
 *
 * A unique index is the only *server-side* rule in this module, so the constraint name decides the sentence:
 * "trùng tên công ty" and "email này đã được ghi nhận" are both `23505` but mean different things to the
 * owner reading the dialog. The two guard triggers raise with an `errcode` of `23503` and their token in the
 * message, which is why the token is checked before the code.
 *
 * `action` is the English verb phrase for the log line (`Unable to create the customer:`), and everything
 * unrecognised stays an `Error` so the route answers a `500` it can log — never a sentence from Postgres.
 */
const UNIQUE_MESSAGES: Readonly<Record<string, string>> = {
  customers_org_company_key:
    "Đã có khách hàng trùng tên công ty. Mở khách hàng đó thay vì thêm mới.",
  customers_org_email_key:
    "Email liên hệ này đã thuộc một khách hàng khác trong tổ chức.",
  customer_contracts_org_no_key:
    "Số hợp đồng này đã tồn tại trong tổ chức. Chọn một số khác.",
  customer_emails_org_message_key:
    "Email này đã được ghi nhận trước đó — mỗi thư chỉ ghi một lần.",
  customer_reminder_logs_once_per_day:
    "Việc này đã được ghi nhận trong hôm nay. Mai có thể nhắc lại.",
};

function conflictSentence(text: string): string | null {
  const entry = Object.entries(UNIQUE_MESSAGES).find(([constraint]) =>
    text.includes(constraint),
  );

  return entry ? entry[1] : null;
}

export function throwCrmError(
  error: PostgrestLikeError,
  action: string,
): never {
  const text = `${error.message} ${error.details ?? ""}`;

  // The guards say *why* the delete is refused; a bare 23503 on `customer_contracts.customer_id` would
  // otherwise read like an opaque foreign-key failure.
  if (text.includes("CUSTOMER_HAS_DATA")) {
    throw new CrmConflictError(
      "Khách hàng này còn hợp đồng nên không xoá được. Chuyển trạng thái sang “Đã rời” để lưu lịch sử.",
    );
  }

  if (text.includes("CONTRACT_HAS_DATA")) {
    throw new CrmConflictError(
      "Hợp đồng này còn email, dịch vụ hoặc lần nhắc nên không xoá được. Dùng “Chấm dứt” thay vì xoá.",
    );
  }

  if (error.code === "23505") {
    throw new CrmConflictError(
      conflictSentence(text) ?? "Dữ liệu này đã tồn tại. Kiểm tra lại trước khi lưu.",
    );
  }

  if (error.code === "23503") {
    throw new CrmConflictError(
      "Dữ liệu này còn được tham chiếu ở nơi khác nên không thể xoá hoặc đổi.",
    );
  }

  if (
    error.code === "23514" ||
    error.code === "23502" ||
    error.code === "22023" ||
    error.code === "22P02"
  ) {
    throw new CrmInputError(
      "Một trường không hợp lệ hoặc vượt giới hạn. Kiểm tra lại ngày tháng, số tiền và độ dài.",
    );
  }

  if (error.code === "42501") {
    throw new CrmForbiddenError(
      "Chỉ chủ sở hữu tổ chức mới quản lý được khách hàng và hợp đồng.",
    );
  }

  throw new Error(`Unable to ${action}: ${error.message}`);
}
