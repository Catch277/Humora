/**
 * Nhật ký trao đổi email với khách (SCRUM-101, C3).
 *
 * Đây **không** phải tích hợp Gmail: app không giữ OAuth token và không đọc hộp thư. Mỗi dòng ghi lại thứ
 * đã trao đổi (tiêu đề, người gửi/nhận, nội dung, thời điểm) và nơi luồng thư nằm (`gmail_thread_url`), để
 * lần sau mở lại đúng thư trong Gmail. Nhờ vậy yêu cầu "quản lý Gmail liên quan hợp đồng và khách hàng"
 * được đáp ứng mà không thêm dependency, không lưu khoá bí mật và không phải xin quyền đọc thư.
 *
 * `gmailThreadUrl` chỉ nhận `https://mail.google.com/…` (API và CHECK của bảng cùng chặn): giá trị đó được
 * render thẳng vào `href`, nên một scheme lạ là lỗ hổng XSS.
 */
export const EMAIL_DIRECTIONS = ["INBOUND", "OUTBOUND", "NOTE"] as const;

export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number];

export interface CustomerEmail {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_id: string | null;
  direction: EmailDirection;
  subject: string;
  counterpart_email: string;
  counterpart_name: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_url: string | null;
  sent_at: string;
  snippet: string | null;
  body: string | null;
  created_at: string;
}

/** Mirrors the CHECKs of `customer_emails`. */
export const CUSTOMER_EMAIL_LIMITS = {
  subject: { min: 1, max: 200 },
  counterpartName: 120,
  gmailId: 200,
  snippet: 500,
  body: 8000,
} as const;

export interface LogCustomerEmailInput {
  customerId: string;
  contractId: string | null;
  direction: EmailDirection;
  subject: string;
  counterpartEmail: string;
  counterpartName: string | null;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
  gmailThreadUrl: string | null;
  sentAt: string;
  snippet: string | null;
  body: string | null;
}

export interface CustomerEmailFilters {
  customerId?: string;
  contractId?: string;
  direction?: EmailDirection;
  search?: string;
}

export function isEmailDirection(value: unknown): value is EmailDirection {
  return (
    typeof value === "string" &&
    (EMAIL_DIRECTIONS as readonly string[]).includes(value)
  );
}
