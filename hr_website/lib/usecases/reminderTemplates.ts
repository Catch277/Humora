import type { ReminderKind } from "@/lib/domain/entities/CustomerReminder";

/**
 * Soạn sẵn thư nhắc khách (SCRUM-102, C5).
 *
 * Một bản duy nhất cho cả nút "Mở Gmail" và bản ghi `customer_reminder_logs`, nên thư người dùng gửi và
 * thư được lưu lại không thể lệch nhau. Câu chữ ở đây là **tiếng Việt cố định**: người nhận là khách của
 * tổ chức, không phải người đang đọc màn hình, nên nó không đi theo `humora-locale`.
 */

/** `2026-03-31` → `31/03/2026`, the way every Vietnamese screen writes a date. */
function formatDateText(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export type ReminderDraftContext = {
  customerName: string;
  appName: string;
  contactName: string | null;
  kind: ReminderKind;
  dueOn: string;
  daysLeft: number;
  itemLabel: string;
};

export type ReminderDraft = { subject: string; body: string };

export function reminderDraft({
  customerName,
  appName,
  contactName,
  kind,
  dueOn,
  daysLeft,
  itemLabel,
}: ReminderDraftContext): ReminderDraft {
  const greeting = contactName
    ? `Kính gửi anh/chị ${contactName},`
    : "Kính gửi Quý khách,";
  const due = formatDateText(dueOn);
  const signature = "Trân trọng,\nHumora HR";

  if (kind === "MAINTENANCE") {
    const distance =
      daysLeft >= 0
        ? `còn ${daysLeft} ngày`
        : `đã quá hạn ${Math.abs(daysLeft)} ngày`;

    return {
      subject: `[Humora] Lịch bảo trì ${appName} — ${due}`,
      body: [
        greeting,
        "",
        `Hệ thống ${appName} của ${customerName} đến kỳ bảo trì ${itemLabel} vào ngày ${due} (${distance}).`,
        "Chúng tôi muốn thống nhất thời điểm kỹ thuật viên đến kiểm tra để không ảnh hưởng giờ làm việc của công ty.",
        "",
        "Anh/chị vui lòng trả lời thư này với thời gian phù hợp, hoặc gọi lại cho chúng tôi nếu cần đổi lịch.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (kind === "EXPIRY") {
    return {
      subject: `[Humora] Bảo hành ${appName} sắp hết hạn — ${due}`,
      body: [
        greeting,
        "",
        `Gói bảo hành ${itemLabel} của ${customerName} cho hệ thống ${appName} sẽ hết hạn vào ngày ${due}.`,
        "Sau mốc này, các yêu cầu sửa lỗi phát sinh sẽ được xử lý theo phí ngoài bảo hành.",
        "Nếu công ty muốn gia hạn bảo hành, anh/chị trả lời thư này để chúng tôi gửi báo giá.",
        "",
        signature,
      ].join("\n"),
    };
  }

  if (kind === "USAGE") {
    return {
      subject: `[Humora] Tiếp tục sử dụng ${appName}?`,
      body: [
        greeting,
        "",
        `Hợp đồng ${itemLabel} của ${customerName} đã hết hạn vào ngày ${due}.`,
        "Hệ thống vẫn giữ nguyên dữ liệu nhân sự, ca làm và bảng công trong thời gian chờ gia hạn.",
        "Nếu công ty muốn tiếp tục sử dụng, anh/chị trả lời thư này để chúng tôi kích hoạt lại và xuất hoá đơn cho kỳ mới.",
        "",
        signature,
      ].join("\n"),
    };
  }

  // RENEWAL (and OTHER, which only ever comes from a manual entry).
  return {
    subject: `[Humora] Gia hạn hợp đồng ${itemLabel} — ${due}`,
    body: [
      greeting,
      "",
      `Hợp đồng ${itemLabel} của ${customerName} cho hệ thống ${appName} sẽ hết hạn vào ngày ${due} (${daysLeft} ngày nữa).`,
      "Để việc xếp ca và chấm công không bị gián đoạn, anh/chị vui lòng xác nhận gia hạn trước ngày trên.",
      "Chúng tôi có thể giữ nguyên đơn giá hiện tại nếu hợp đồng được gia hạn trong tháng này.",
      "",
      signature,
    ].join("\n"),
  };
}
