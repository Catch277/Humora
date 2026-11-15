/// Đường dẫn object cho ảnh chấm công trên bucket `attendance-photos`.
///
/// Quy ước (SCRUM-95/96): `<organization>/<employee>/<work_date>/<in|out>-<instant>.jpg`. Hàm
/// `attendance_clock_in` / `attendance_clock_out` kiểm ba đoạn đầu **trước khi** ghi dòng công:
/// tổ chức của người gọi, chính người gọi, và `work_date` mà nó suy ra từ `p_check_in_at` (giờ
/// Bangkok). Lệch một ngày là `ATT_PHOTO_PATH_INVALID`, nên `workDate` ở đây tính từ **đúng thời
/// điểm được gửi lên**, không phải `DateTime.now()`.
///
/// `null` khi thiếu tổ chức hoặc nhân viên: lần chấm công đi tiếp mà không kèm ảnh, thay vì hỏng.
String? attendancePhotoPath({
  required String organizationId,
  required String employeeId,
  required DateTime at,
  required bool checkIn,
}) {
  final org = organizationId.trim();
  final employee = employeeId.trim();
  if (org.isEmpty || employee.isEmpty) return null;
  if (org.contains('/') || employee.contains('/')) return null;

  final instant = at.toUtc();
  // Asia/Bangkok là UTC+7 và không có DST — cùng cách `bangkokToday()` chia ngày làm việc.
  final bangkok = instant.add(const Duration(hours: 7));
  final workDate = '${bangkok.year}-${_two(bangkok.month)}-${_two(bangkok.day)}';

  // Tên object không giữ dấu ':' (một số proxy/URL không bảo toàn nó); phần còn lại vẫn là ISO.
  final stamp = instant.toIso8601String().replaceAll(':', '-');
  final kind = checkIn ? 'in' : 'out';

  return '$org/$employee/$workDate/$kind-$stamp.jpg';
}

String _two(int n) => n.toString().padLeft(2, '0');
