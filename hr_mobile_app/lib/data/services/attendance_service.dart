import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/format.dart';
import '../models/attendance_record.dart';
import 'api_error.dart';

/// Bảng công của chính mình (đọc trực tiếp Supabase, RLS giới hạn theo người dùng).
class AttendanceService {
  AttendanceService({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const Duration _timeout = Duration(seconds: 20);

  String get _uid {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw AppException('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
    return id;
  }

  Future<List<AttendanceRecord>> month(DateTime month) async {
    final start = DateTime(month.year, month.month, 1);
    final end = DateTime(month.year, month.month + 1, 0);
    try {
      final rows = await _client
          .from('attendance')
          .select(AttendanceRecord.columns)
          .eq('employee_id', _uid)
          .gte('work_date', toSqlDate(start))
          .lte('work_date', toSqlDate(end))
          .order('work_date', ascending: false)
          .timeout(_timeout);
      return (rows as List)
          .map((r) => AttendanceRecord.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } catch (e) {
      throw toAppException(e);
    }
  }

  /// Gửi khiếu nại cho một dòng công của chính mình (giống thao tác của web).
  Future<void> complain(String attendanceId, String text) async {
    final now = DateTime.now().toUtc().toIso8601String();
    try {
      final rows = await _client
          .from('attendance')
          .update({
            'complaint': text,
            'complaint_at': now,
            'complaint_status': 'OPEN',
            'complaint_resolved_by': null,
            'complaint_resolved_at': null,
          })
          .eq('id', attendanceId)
          .eq('employee_id', _uid)
          .select('id')
          .timeout(_timeout);
      if ((rows as List).isEmpty) {
        throw AppException('Không gửi được khiếu nại cho dòng công này.');
      }
    } catch (e) {
      throw toAppException(e);
    }
  }
}
