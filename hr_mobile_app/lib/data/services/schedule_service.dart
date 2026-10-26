import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/format.dart';
import 'api_error.dart';

class ShiftTemplate {
  const ShiftTemplate({required this.id, required this.name, required this.start, required this.end});
  final String id;
  final String name;
  final String start;
  final String end;
  String get label => '$name ($start - $end)';
}

/// Kết quả đăng ký một ca trong lần gửi nhiều ca.
class RegisterOutcome {
  const RegisterOutcome({required this.shiftId, required this.date, this.error});
  final String shiftId;
  final DateTime date;

  /// null = thành công.
  final String? error;
  bool get ok => error == null;
}

class ScheduledShift {
  const ScheduledShift({
    required this.id,
    required this.workDate,
    required this.name,
    required this.start,
    required this.end,
    required this.status,
    required this.isRegistration,
  });
  final String id;
  final DateTime workDate;
  final String name;
  final String start;
  final String end;

  /// Ca đã phân: SCHEDULED / LEAVE / CANCELLED. Đăng ký ca: PENDING / APPROVED / REJECTED.
  final String status;
  final bool isRegistration;
}

String _hm(dynamic t) {
  final s = (t ?? '').toString();
  return s.length >= 5 ? s.substring(0, 5) : s;
}

/// Lịch làm việc của chính mình + đăng ký ca (bảng shift_assignments, shift_registrations).
class ScheduleService {
  ScheduleService({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const Duration _timeout = Duration(seconds: 20);

  String get _uid {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw AppException('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
    return id;
  }

  Map<String, dynamic>? _shiftOf(dynamic raw) {
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is List && raw.isNotEmpty && raw.first is Map) {
      return Map<String, dynamic>.from(raw.first as Map);
    }
    return null;
  }

  Future<List<ScheduledShift>> week(DateTime monday) =>
      range(monday, monday.add(const Duration(days: 6)));

  /// Ca đã phân + đăng ký đang chờ/bị từ chối trong khoảng ngày [fromDate, toDate] (gồm cả hai đầu).
  Future<List<ScheduledShift>> range(DateTime fromDate, DateTime toDate) async {
    final monday = fromDate;
    final from = toSqlDate(fromDate);
    final to = toSqlDate(toDate);
    try {
      final assigned = await _client
          .from('shift_assignments')
          .select('id, work_date, status, shift:shifts(name, start_time, end_time)')
          .eq('employee_id', _uid)
          .gte('work_date', from)
          .lte('work_date', to)
          .timeout(_timeout);
      final regs = await _client
          .from('shift_registrations')
          .select('id, work_date, status, shift:shifts(name, start_time, end_time)')
          .eq('employee_id', _uid)
          .inFilter('status', ['PENDING', 'REJECTED'])
          .gte('work_date', from)
          .lte('work_date', to)
          .timeout(_timeout);

      ScheduledShift map(dynamic r, bool isReg) {
        final m = Map<String, dynamic>.from(r as Map);
        final s = _shiftOf(m['shift']);
        return ScheduledShift(
          id: m['id'].toString(),
          workDate: parseDate(m['work_date']) ?? monday,
          name: (s?['name'] ?? 'Ca làm việc').toString(),
          start: _hm(s?['start_time']),
          end: _hm(s?['end_time']),
          status: (m['status'] ?? '').toString(),
          isRegistration: isReg,
        );
      }

      final all = <ScheduledShift>[
        ...(assigned as List).map((r) => map(r, false)),
        ...(regs as List).map((r) => map(r, true)),
      ];
      all.sort((a, b) {
        final c = a.workDate.compareTo(b.workDate);
        return c != 0 ? c : a.start.compareTo(b.start);
      });
      return all;
    } catch (e) {
      throw toAppException(e);
    }
  }

  /// Các ca có thể đăng ký (bỏ ca đã ngưng dùng và ca "Nghỉ" dài 0 giờ).
  Future<List<ShiftTemplate>> templates() async {
    try {
      final rows = await _client
          .from('shifts')
          .select('id, name, start_time, end_time, is_active')
          .timeout(_timeout);
      final list = <ShiftTemplate>[];
      for (final r in rows as List) {
        final m = Map<String, dynamic>.from(r as Map);
        if (m['is_active'] == false) continue;
        final s = _hm(m['start_time']);
        final e = _hm(m['end_time']);
        if (s == e) continue;
        list.add(ShiftTemplate(id: m['id'].toString(), name: (m['name'] ?? '').toString(), start: s, end: e));
      }
      list.sort((a, b) => a.start.compareTo(b.start));
      return list;
    } catch (e) {
      throw toAppException(e);
    }
  }

  Future<void> register({required String shiftId, required DateTime date}) async {
    try {
      final profile = await _client
          .from('users')
          .select('branch_id')
          .eq('id', _uid)
          .maybeSingle()
          .timeout(_timeout);
      final branchId = profile?['branch_id']?.toString();
      if (branchId == null) {
        throw AppException('Bạn chưa được gán chi nhánh nên chưa đăng ký ca được. Hãy liên hệ quản lý.');
      }
      await _client.from('shift_registrations').insert({
        'employee_id': _uid,
        'branch_id': branchId,
        'shift_id': shiftId,
        'work_date': toSqlDate(date),
        'status': 'PENDING',
      }).timeout(_timeout);
    } on PostgrestException catch (e) {
      if (e.code == '23505') {
        throw AppException('Bạn đã đăng ký ca này rồi.');
      }
      throw toAppException(e);
    } catch (e) {
      throw toAppException(e);
    }
  }

  Future<String> _branchId() async {
    try {
      final profile = await _client
          .from('users')
          .select('branch_id')
          .eq('id', _uid)
          .maybeSingle()
          .timeout(_timeout);
      final b = profile?['branch_id']?.toString();
      if (b == null) {
        throw AppException('Bạn chưa được gán chi nhánh nên chưa đăng ký ca được. Hãy liên hệ quản lý.');
      }
      return b;
    } catch (e) {
      throw toAppException(e);
    }
  }

  /// Đăng ký nhiều ca. Mỗi ca được gửi riêng; ca nào lỗi thì ghi lại lý do và vẫn gửi tiếp các ca còn lại,
  /// để người dùng giữ được những lựa chọn hợp lệ.
  Future<List<RegisterOutcome>> registerMany(List<({String shiftId, DateTime date})> items) async {
    final branchId = await _branchId();

    final out = <RegisterOutcome>[];
    for (final it in items) {
      try {
        await _client.from('shift_registrations').insert({
          'employee_id': _uid,
          'branch_id': branchId,
          'shift_id': it.shiftId,
          'work_date': toSqlDate(it.date),
          'status': 'PENDING',
        }).timeout(_timeout);
        out.add(RegisterOutcome(shiftId: it.shiftId, date: it.date));
      } on PostgrestException catch (e) {
        final msg = e.code == '23505' ? 'Bạn đã đăng ký ca này rồi.' : toAppException(e).message;
        out.add(RegisterOutcome(shiftId: it.shiftId, date: it.date, error: msg));
      } catch (e) {
        out.add(RegisterOutcome(shiftId: it.shiftId, date: it.date, error: toAppException(e).message));
      }
    }
    return out;
  }
}
