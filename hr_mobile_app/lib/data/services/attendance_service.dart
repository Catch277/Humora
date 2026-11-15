import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/format.dart';
import '../models/attendance_record.dart';
import 'api_error.dart';
import 'attendance_photo_path.dart';

/// Câu tiếng Việt cho các mã lỗi máy do `attendance_clock_in` / `attendance_clock_out` ném ra
/// (`supabase/sql/SCRUM-96_attendance_clock_rpc.sql`). Nội dung bám theo lỗi domain của web
/// (`lib/domain/errors/Attendance*Error.ts`) để hai màn hình nói cùng một câu.
const Map<String, String> attendanceClockMessages = {
  'AUTH_REQUIRED': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.',
  'PROFILE_MISSING': 'Tài khoản chưa có hồ sơ người dùng. Hãy liên hệ chủ sở hữu tổ chức.',
  'ATT_OWNER_FORBIDDEN':
      'Chủ sở hữu tổ chức không chấm công; chỉ nhân viên và quản lý chấm công.',
  'ATT_TIME_REQUIRED': 'Không đọc được giờ trên thiết bị. Hãy kiểm tra giờ máy rồi thử lại.',
  'ATT_CLOCK_AHEAD':
      'Giờ trên thiết bị đang nhanh hơn máy chủ. Hãy bật "giờ tự động" trên máy rồi thử lại.',
  'ATT_COORDINATES_INVALID': 'Toạ độ GPS không hợp lệ. Hãy bật định vị rồi thử lại.',
  'ATT_NOTE_TOO_LONG': 'Ghi chú dài quá 500 ký tự.',
  'ATT_PHOTO_PATH_INVALID': 'Ảnh xác thực không hợp lệ nên lần chấm công này không kèm ảnh.',
  'ATT_BRANCH_REQUIRED': 'Bạn phụ trách nhiều chi nhánh; hãy nhờ quản lý cấp lại chi nhánh làm việc.',
  'ATT_BRANCH_NOT_ASSIGNED':
      'Bạn chưa được gán chi nhánh nên chưa chấm công được. Hãy liên hệ quản lý.',
  'ATT_NO_SHIFT_TODAY':
      'Bạn không có ca làm việc nào được xếp cho ngày làm việc này nên không có ca để chấm công.',
  'ATT_ALREADY_CHECKED_IN': 'Ca này hôm nay đã được vào ca rồi.',
  'ATT_ALREADY_CHECKED_OUT': 'Ca này đã được ghi nhận ra ca rồi.',
  'ATT_NOT_CHECKED_IN': 'Không tìm thấy bản ghi vào ca nào trong ngày làm việc này.',
  'ATT_AMBIGUOUS_SHIFT': 'Bạn còn nhiều hơn một ca chưa ra ca; hãy nói rõ ca cần kết thúc.',
  'ATT_CHECK_OUT_BEFORE_IN': 'Giờ ra ca phải sau giờ vào ca.',
  'ATT_SHIFT_NOT_STARTED': 'Chưa tới giờ vào ca.',
  'ATT_SHIFT_ENDED': 'Ca đã kết thúc nên không thể vào ca được nữa.',
  'BRANCH_FORBIDDEN': 'Bạn không phụ trách chi nhánh này.',
  'SHIFT_NOT_FOUND': 'Không tìm thấy ca làm việc này.',
  'PERMISSION_DENIED': 'Bạn không có quyền thực hiện thao tác này.',
  'RPC_MISSING':
      'Chức năng chấm công chưa được cài đặt trên máy chủ. Hãy báo quản trị viên chạy SCRUM-96.',
  'NETWORK': 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  'DB_ERROR': 'Lỗi máy chủ, thử lại sau.',
};

/// Một ca được xếp cho hôm nay (chỉ ca `SCHEDULED`).
class TodayAssignment {
  const TodayAssignment({
    required this.id,
    required this.shiftId,
    required this.name,
    required this.start,
    required this.end,
  });

  final String id;
  final String shiftId;
  final String name;

  /// "HH:mm" của mẫu ca; null khi mẫu ca không có giờ.
  final String? start;
  final String? end;

  factory TodayAssignment.fromJson(Map<String, dynamic> j) {
    final s = _embeddedShift(j['shift']);
    return TodayAssignment(
      id: (j['id'] ?? '').toString(),
      shiftId: (j['shift_id'] ?? '').toString(),
      name: (s?['name'] ?? '').toString(),
      start: _hm(s?['start_time']),
      end: _hm(s?['end_time']),
    );
  }
}

/// Dòng chấm công của hôm nay.
class TodayAttendance {
  const TodayAttendance({
    required this.id,
    required this.shiftId,
    required this.checkInAt,
    required this.checkOutAt,
    required this.status,
  });

  final String id;
  final String? shiftId;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;
  final String status;

  /// Đã vào ca và chưa ra: ca đang mở.
  bool get isOpen => checkInAt != null && checkOutAt == null;

  factory TodayAttendance.fromJson(Map<String, dynamic> j) => TodayAttendance(
        id: (j['id'] ?? '').toString(),
        shiftId: j['shift_id']?.toString(),
        checkInAt: parseDate(j['check_in_at']),
        checkOutAt: parseDate(j['check_out_at']),
        status: (j['status'] ?? 'ON_TIME').toString(),
      );
}

/// Màn hình chính đọc đúng hai thứ này: ca hôm nay và dòng công hôm nay.
class TodaySnapshot {
  const TodaySnapshot({required this.assignments, required this.attendance});

  final List<TodayAssignment> assignments;
  final List<TodayAttendance> attendance;
}

/// Kết quả một lần chấm công, đủ để màn hình nói "vào lúc mấy giờ, trễ hay không".
class AttendanceClockResult {
  const AttendanceClockResult({
    required this.id,
    required this.shiftId,
    required this.status,
    required this.checkInAt,
    required this.checkOutAt,
  });

  final String id;
  final String? shiftId;
  final String status;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;

  factory AttendanceClockResult.fromRow(Map<String, dynamic> row) =>
      AttendanceClockResult(
        id: (row['id'] ?? '').toString(),
        shiftId: row['shift_id']?.toString(),
        status: (row['status'] ?? 'ON_TIME').toString(),
        checkInAt: parseDate(row['check_in_at']),
        checkOutAt: parseDate(row['check_out_at']),
      );
}

Map<String, dynamic>? _embeddedShift(dynamic raw) {
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is List && raw.isNotEmpty && raw.first is Map) {
    return Map<String, dynamic>.from(raw.first as Map);
  }
  return null;
}

String? _hm(dynamic t) {
  final s = (t ?? '').toString();
  return s.length >= 5 ? s.substring(0, 5) : (s.isEmpty ? null : s);
}

/// Bảng công của chính mình (đọc trực tiếp Supabase, RLS giới hạn theo người dùng) và hai thao
/// tác chấm công.
///
/// Chấm công đi qua `attendance_clock_in` / `attendance_clock_out` (SCRUM-96) — cùng quy tắc với
/// web: cửa sổ `[bắt đầu − 5 phút, kết thúc − 5 phút]`, vào ca lại khi ca còn chạy, quản lý chấm
/// công được ở chi nhánh mình phụ trách, chủ sở hữu thì không. Không tự tính "trễ / về sớm" ở
/// client: database quyết định.
class AttendanceService {
  AttendanceService({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const Duration _timeout = Duration(seconds: 20);

  String get _uid {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw AppException('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
    return id;
  }

  /// Ca hôm nay và dòng công hôm nay của chính mình — thay cho `GET /today` của `app-api`.
  ///
  /// Chỉ ca `SCHEDULED` mới chấm công được (`attendance_clock_in` cũng đòi đúng thế), nên ca
  /// `LEAVE` / `CANCELLED` không hiện ra như một ca đang chờ. Ngày làm việc là ngày ở
  /// Asia/Bangkok, không phải ngày trên đồng hồ của máy.
  Future<TodaySnapshot> today() async {
    final day = bangkokToday();
    try {
      final assignmentRows = await _client
          .from('shift_assignments')
          .select('id, shift_id, status, shift:shifts(name, start_time, end_time)')
          .eq('employee_id', _uid)
          .eq('work_date', day)
          .eq('status', 'SCHEDULED')
          .timeout(_timeout);
      final attendanceRows = await _client
          .from('attendance')
          .select('id, shift_id, check_in_at, check_out_at, status')
          .eq('employee_id', _uid)
          .eq('work_date', day)
          .timeout(_timeout);

      return TodaySnapshot(
        assignments: (assignmentRows as List)
            .map((r) =>
                TodayAssignment.fromJson(Map<String, dynamic>.from(r as Map)))
            .where((a) => a.shiftId.isNotEmpty)
            .toList(),
        attendance: (attendanceRows as List)
            .map((r) =>
                TodayAttendance.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList(),
      );
    } catch (e) {
      throw toAppException(e);
    }
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

  /// Chấm công vào ca [shiftId]. Giờ do **thiết bị** gửi lên (SCRUM-96): một lần bấm lúc mất mạng
  /// vẫn ghi đúng ngày nó xảy ra, và hàm SQL chỉ chấp nhận lệch tối đa 5 phút về tương lai.
  ///
  /// [photoBytes] là ảnh vừa chụp, **không bắt buộc**: ảnh được tải lên bucket `attendance-photos`
  /// (SCRUM-95) và chỉ đường dẫn được gửi kèm; nếu tải ảnh thất bại hoặc database từ chối đường dẫn
  /// thì lần chấm công vẫn được ghi, chỉ thiếu ảnh.
  Future<AttendanceClockResult> checkIn(
    String shiftId,
    double lat,
    double lng, {
    Uint8List? photoBytes,
  }) async {
    final at = DateTime.now().toUtc();
    final branchId = await _clockBranchId();
    final photoPath = await _uploadPhoto(photoBytes, at: at, checkIn: true);

    Map<String, dynamic> params({String? photo}) => <String, dynamic>{
          'p_latitude': lat,
          'p_longitude': lng,
          'p_check_in_at': _iso(at),
          'p_shift_id': shiftId,
          'p_branch_id': branchId,
          'p_photo_path': ?photo,
        };

    try {
      return AttendanceClockResult.fromRow(
        await _clock('attendance_clock_in', params(photo: photoPath)),
      );
    } on AppException catch (e) {
      // Ảnh không được database chấp nhận thì chấm công lại **không kèm ảnh**: một tấm ảnh không
      // bao giờ được làm hỏng lần chấm công. Hàm SQL kiểm đường dẫn trước khi ghi dòng, nên lần thử
      // lại không tạo bản ghi thứ hai.
      if (photoPath == null || !_isPhotoPathError(e)) rethrow;
      return AttendanceClockResult.fromRow(
        await _clock('attendance_clock_in', params()),
      );
    }
  }

  /// Chấm công ra. Không truyền `p_attendance_id`: hàm SQL đóng dòng đang mở duy nhất của người
  /// gọi, và báo `ATT_AMBIGUOUS_SHIFT` nếu có nhiều hơn một.
  Future<AttendanceClockResult> checkOut(
    double lat,
    double lng, {
    Uint8List? photoBytes,
  }) async {
    final at = DateTime.now().toUtc();
    final photoPath = await _uploadPhoto(photoBytes, at: at, checkIn: false);

    Map<String, dynamic> params({String? photo}) => <String, dynamic>{
          'p_latitude': lat,
          'p_longitude': lng,
          'p_check_out_at': _iso(at),
          'p_photo_path': ?photo,
        };

    try {
      return AttendanceClockResult.fromRow(
        await _clock('attendance_clock_out', params(photo: photoPath)),
      );
    } on AppException catch (e) {
      if (photoPath == null || !_isPhotoPathError(e)) rethrow;
      return AttendanceClockResult.fromRow(
        await _clock('attendance_clock_out', params()),
      );
    }
  }

  static const String _photoBucket = 'attendance-photos';

  /// Bucket `attendance-photos` giới hạn 5 MB (SCRUM-95) — ảnh lớn hơn thì bỏ ảnh, giữ lần chấm công.
  static const int _maxPhotoBytes = 5 * 1024 * 1024;

  static String _iso(DateTime at) => at.toUtc().toIso8601String();

  /// Tải ảnh lên bucket riêng và trả đường dẫn object, hoặc `null` khi không tải được.
  ///
  /// Ảnh **không bao giờ** là điều kiện để chấm công thành công: bucket chưa được tạo, mất mạng,
  /// hết quyền hay ảnh quá lớn đều chỉ ghi log rồi đi tiếp.
  Future<String?> _uploadPhoto(
    Uint8List? bytes, {
    required DateTime at,
    required bool checkIn,
  }) async {
    if (bytes == null || bytes.isEmpty || bytes.length > _maxPhotoBytes) return null;

    try {
      final profile = await _profile();
      final path = attendancePhotoPath(
        organizationId: (profile?['organization_id'] ?? '').toString(),
        employeeId: _uid,
        at: at,
        checkIn: checkIn,
      );
      if (path == null) return null;

      await _client.storage.from(_photoBucket).uploadBinary(
            path,
            bytes,
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: false),
          );
      return path;
    } catch (e) {
      if (kDebugMode) debugPrint('Attendance photo skipped: $e');
      return null;
    }
  }

  bool _isPhotoPathError(AppException e) =>
      e.message == attendanceClockMessages['ATT_PHOTO_PATH_INVALID'];

  Future<Map<String, dynamic>> _clock(
    String fn,
    Map<String, dynamic> params,
  ) async {
    try {
      final res = await _client.rpc(fn, params: params).timeout(_timeout);
      final row = _firstRow(res);
      if (row == null) throw AppException(attendanceClockMessages['DB_ERROR']!);
      return row;
    } on AppException {
      rethrow;
    } on PostgrestException catch (e) {
      throw _clockError(e);
    } on TimeoutException {
      throw AppException(attendanceClockMessages['NETWORK']!);
    } catch (_) {
      throw AppException(attendanceClockMessages['NETWORK']!);
    }
  }

  /// Một hàm trả về `public.attendance` cho một **object**; vẫn chấp nhận mảng để bản SQL nào trả
  /// `returns setof` cũng chạy được.
  Map<String, dynamic>? _firstRow(dynamic raw) {
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is List && raw.isNotEmpty && raw.first is Map) {
      return Map<String, dynamic>.from(raw.first as Map);
    }
    return null;
  }

  Map<String, dynamic>? _profileRow;

  /// Hồ sơ của người gọi (vai trò, chi nhánh, tổ chức) — đọc một lần cho mỗi lần mở màn hình, vì
  /// chấm công cần cả ba: quy tắc chi nhánh của quản lý và đoạn `<org>` của đường dẫn ảnh.
  Future<Map<String, dynamic>?> _profile() async {
    final cached = _profileRow;
    if (cached != null) return cached;

    final row = await _client
        .from('users')
        .select('role, branch_id, organization_id')
        .eq('id', _uid)
        .maybeSingle()
        .timeout(_timeout);
    if (row == null) return null;

    return _profileRow = Map<String, dynamic>.from(row as Map);
  }

  /// Chi nhánh để chấm công. Nhân viên: hàm SQL tự lấy `users.branch_id` nên không cần gửi.
  /// Quản lý: `p_branch_id` là bắt buộc — chi nhánh của chính họ, nếu trống thì chi nhánh duy nhất
  /// họ phụ trách (`branches.manager_id`).
  Future<String?> _clockBranchId() async {
    final uid = _uid;
    try {
      final profile = await _profile();
      final role = (profile?['role'] ?? '').toString().trim().toUpperCase();
      // 'CHU' là tên cũ của MANAGER (lib/domain/roles.ts phía web).
      if ((role == 'CHU' ? 'MANAGER' : role) != 'MANAGER') return null;

      final own = profile?['branch_id']?.toString();
      if (own != null && own.isNotEmpty) return own;

      final headed = await _client
          .from('branches')
          .select('id')
          .eq('manager_id', uid)
          .limit(2)
          .timeout(_timeout);
      final ids = (headed as List)
          .map((r) => Map<String, dynamic>.from(r as Map)['id']?.toString())
          .whereType<String>()
          .toList();
      if (ids.length == 1) return ids.first;
      throw AppException(attendanceClockMessages[
          ids.isEmpty ? 'ATT_BRANCH_NOT_ASSIGNED' : 'ATT_BRANCH_REQUIRED']!);
    } on AppException {
      rethrow;
    } on TimeoutException {
      throw AppException(attendanceClockMessages['NETWORK']!);
    } on PostgrestException catch (e) {
      throw _clockError(e);
    } catch (_) {
      throw AppException(attendanceClockMessages['NETWORK']!);
    }
  }
  /// `raise exception 'TOKEN: chi tiết'` được PostgREST trả nguyên trong `message`, kèm mã Postgres
  /// (`P0001`, `P0002`, `28000`, `42501`) nên ở đây tách token ra khỏi phần chi tiết.
  AppException _clockError(PostgrestException e) {
    if (e.code == 'PGRST202') {
      return AppException(attendanceClockMessages['RPC_MISSING']!);
    }

    final raw = e.message.trim();
    final sep = raw.indexOf(':');
    final head = (sep == -1 ? raw : raw.substring(0, sep)).trim();
    final detail = sep == -1 ? null : raw.substring(sep + 1).trim();
    // Chỉ phần đầu dạng TOKEN mới là mã của hàm; còn lại là thông báo khác của PostgREST.
    final base = RegExp(r'^[A-Z][A-Z0-9_]*$').hasMatch(head)
        ? attendanceClockMessages[head]
        : null;

    if (base != null) {
      // Hai mã này mang tên ca và giờ trong `detail`; ghép lại thành đúng câu web đọc được.
      if (head == 'ATT_SHIFT_NOT_STARTED' || head == 'ATT_SHIFT_ENDED') {
        final m =
            RegExp(r'^(.*)\s*\((\d{2}:\d{2})\)$').firstMatch(detail ?? '');
        final name = (m?.group(1) ?? detail ?? '').trim();
        final at = m?.group(2) ?? '';
        return AppException(head == 'ATT_SHIFT_NOT_STARTED'
            ? 'Ca “$name” bắt đầu lúc $at nên chưa tới giờ vào ca.'
            : 'Ca “$name” đã kết thúc lúc $at nên không thể vào ca được nữa.');
      }
      return AppException(
          detail == null || detail.isEmpty ? base : '$base ($detail)');
    }

    switch (e.code) {
      case '42501':
        return AppException(attendanceClockMessages['PERMISSION_DENIED']!);
      case '28000':
        return AppException(attendanceClockMessages['AUTH_REQUIRED']!);
      case 'P0002':
        return AppException(attendanceClockMessages['ATT_NOT_CHECKED_IN']!);
      default:
        return AppException(attendanceClockMessages['DB_ERROR']!);
    }
  }
}
