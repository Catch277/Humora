/// Định dạng hiển thị dùng chung. Không phụ thuộc locale của intl nên không cần khởi tạo gì thêm.

/// Đọc một số nguyên từ JSON (int, double hoặc chuỗi). Trả về [fallback] nếu không đọc được.
int asInt(dynamic v, [int fallback = 0]) {
  if (v == null) return fallback;
  if (v is int) return v;
  if (v is num) return v.round();
  return int.tryParse(v.toString()) ?? fallback;
}

double asDouble(dynamic v, [double fallback = 0]) {
  if (v == null) return fallback;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? fallback;
}

/// Số tiền VND: 24850000 -> "24.850.000 ₫". Tiền luôn là số nguyên (đồng), không dùng số thực.
String formatVnd(int amount, {bool withSymbol = true}) {
  final digits = amount.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('.');
    buf.write(digits[i]);
  }
  final sign = amount < 0 ? '-' : '';
  return withSymbol ? '$sign$buf ₫' : '$sign$buf';
}

/// Chuỗi che số tiền.
const String maskedMoney = '••••••••';

/// 719 -> "11 giờ 59 phút", 45 -> "45 phút", 0 -> "0 phút".
String formatMinutes(int minutes) {
  if (minutes <= 0) return '0 phút';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m phút';
  if (m == 0) return '$h giờ';
  return '$h giờ ${m.toString().padLeft(2, '0')} phút';
}

String _two(int n) => n.toString().padLeft(2, '0');

String formatDate(DateTime d) => '${_two(d.day)}/${_two(d.month)}/${d.year}';
String formatDayMonth(DateTime d) => '${_two(d.day)}/${_two(d.month)}';
String formatMonthYear(DateTime d) => '${_two(d.month)}/${d.year}';
String formatTime(DateTime d) => '${_two(d.hour)}:${_two(d.minute)}';

const List<String> _weekdays = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ Nhật',
];

String weekdayName(DateTime d) => _weekdays[d.weekday - 1];

/// "T2", "T3"... "CN".
String weekdayShort(DateTime d) => d.weekday == 7 ? 'CN' : 'T${d.weekday}';

/// Đọc ngày dạng 'yyyy-MM-dd' (cột date) hoặc ISO có giờ; trả về ngày theo giờ địa phương.
DateTime? parseDate(dynamic v) {
  if (v == null) return null;
  final s = v.toString();
  final parsed = DateTime.tryParse(s);
  if (parsed == null) return null;
  // Cột `date` không có múi giờ nên giữ nguyên; timestamptz đổi sang giờ máy.
  return s.length <= 10 ? parsed : parsed.toLocal();
}

/// Ngày dạng 'yyyy-MM-dd' để gửi lên Postgres.
String toSqlDate(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

/// "vừa xong", "5 phút trước", "Hôm qua", hoặc ngày đầy đủ.
String timeAgo(DateTime when, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final diff = n.difference(when);
  if (diff.inSeconds < 60) return 'Vừa xong';
  if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
  if (diff.inHours < 24 && n.day == when.day) return '${diff.inHours} giờ trước';
  final yesterday = DateTime(n.year, n.month, n.day).subtract(const Duration(days: 1));
  if (DateTime(when.year, when.month, when.day) == yesterday) {
    return 'Hôm qua ${formatTime(when)}';
  }
  return '${formatDate(when)} ${formatTime(when)}';
}
