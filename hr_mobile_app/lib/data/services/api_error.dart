import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Lỗi đã được dịch sang tiếng Việt, an toàn để hiện cho người dùng.
class AppException implements Exception {
  AppException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Biến mọi lỗi (Postgres, mạng, đăng nhập) thành một câu tiếng Việt dễ hiểu.
/// [known] ánh xạ mã lỗi do hàm SQL ném ra (ví dụ 'PAYSLIP_NOT_FOUND') sang câu hiển thị.
/// Không bao giờ đưa nội dung thô của lỗi (có thể chứa tên bảng/cột) cho người dùng.
AppException toAppException(Object e, {Map<String, String> known = const {}}) {
  if (e is AppException) return e;

  String raw;
  String? code;
  if (e is PostgrestException) {
    raw = '${e.message} ${e.details ?? ''} ${e.hint ?? ''}';
    code = e.code;
  } else if (e is AuthException) {
    raw = e.message;
  } else {
    raw = e.toString();
  }
  if (kDebugMode) debugPrint('API error: $raw (code: $code)');

  for (final entry in known.entries) {
    if (raw.contains(entry.key)) return AppException(entry.value);
  }

  if (e is AuthException) {
    return AppException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.');
  }
  if (code == '42501' || raw.contains('permission denied') || raw.contains('row-level security')) {
    return AppException('Bạn không có quyền thực hiện thao tác này.');
  }
  if (code == '42P01' ||
      code == 'PGRST205' ||
      code == 'PGRST202' ||
      raw.contains('does not exist') ||
      raw.contains('Could not find the')) {
    return AppException('Chức năng này chưa được cài đặt đầy đủ trên máy chủ.');
  }
  if (e is TimeoutException) {
    return AppException('Máy chủ phản hồi quá lâu. Kiểm tra mạng rồi thử lại.');
  }
  return AppException('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
}
