import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

const attendanceErrorMessages = {
  'AUTH_REQUIRED': 'Bạn cần đăng nhập.',
  'AUTH_INVALID': 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.',
  'PROFILE_MISSING': 'Tài khoản chưa hoàn tất đăng ký.',
  'ATT_ROLE_FORBIDDEN': 'Chỉ nhân viên mới chấm công được.',
  'ATT_BRANCH_NOT_ASSIGNED': 'Bạn chưa được gán chi nhánh.',
  'ATT_NO_SHIFT_TODAY': 'Hôm nay bạn không có ca này.',
  'BRANCH_FORBIDDEN': 'Ca này không thuộc chi nhánh của bạn.',
  'ATT_ALREADY_CHECKED_IN': 'Bạn đã chấm công vào ca này rồi.',
  'ATT_ALREADY_CHECKED_OUT': 'Bạn đã chấm công ra rồi.',
  'ATT_NOT_CHECKED_IN': 'Bạn chưa chấm công vào.',
  'ATT_AMBIGUOUS_SHIFT': 'Có nhiều ca đang mở, hãy chọn ca cần ra.',
  'ATT_FACE_MISMATCH': 'Khuôn mặt không khớp.',
  'VALIDATION_ERROR': 'Dữ liệu gửi lên không hợp lệ.',
  'DB_ERROR': 'Lỗi máy chủ, thử lại sau.',
};

class ApiException implements Exception {
  ApiException(this.status, this.code);
  final int status;
  final String code;
  String get message =>
      attendanceErrorMessages[code] ?? 'Có lỗi xảy ra ($code)';
  @override
  String toString() => message;
}

class AttendanceApi {
  // Đổi khi chạy: flutter run --dart-define=API_BASE_URL=...
  // 10.0.2.2 = máy tính của bạn, nhìn từ máy ảo Android.
    static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    return kIsWeb
        ? 'http://localhost:3000/api/v1'
        : 'http://10.0.2.2:3000/api/v1';
  }

  Map<String, String> _headers() {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> _get(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers());
    return _handle(res);
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final res = await http.post(Uri.parse('$baseUrl$path'),
        headers: _headers(), body: jsonEncode(body));
    return _handle(res);
  }

  dynamic _handle(http.Response res) {
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final code = data is Map ? (data['code'] ?? 'UNKNOWN') : 'UNKNOWN';
    throw ApiException(res.statusCode, code.toString());
  }

  Future<Map<String, dynamic>> me() async =>
      Map<String, dynamic>.from(await _get('/me'));

  Future<Map<String, dynamic>> today() async =>
      Map<String, dynamic>.from(await _get('/today'));

  Future<List<dynamic>> history() async =>
      List<dynamic>.from(await _get('/attendance/history'));

  Future<Map<String, dynamic>> checkIn(
          String shiftId, double lat, double lng) async =>
      Map<String, dynamic>.from(await _post('/attendance/check-in',
          {'shift_id': shiftId, 'latitude': lat, 'longitude': lng}));

  Future<Map<String, dynamic>> checkOut(double lat, double lng) async =>
      Map<String, dynamic>.from(await _post(
          '/attendance/check-out', {'latitude': lat, 'longitude': lng}));
}