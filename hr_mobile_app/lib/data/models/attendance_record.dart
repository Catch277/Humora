import '../../core/format.dart';

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.workDate,
    required this.shiftName,
    required this.shiftStart,
    required this.shiftEnd,
    required this.checkInAt,
    required this.checkOutAt,
    required this.resumedAt,
    required this.status,
    required this.workedSeconds,
    required this.complaint,
    required this.complaintStatus,
  });

  final String id;
  final DateTime workDate;
  final String? shiftName;
  final String? shiftStart;
  final String? shiftEnd;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;

  /// Lúc đoạn làm hiện tại bắt đầu sau một lần "Vào ca lại" (SCRUM-69); null khi chưa mở lại.
  final DateTime? resumedAt;
  final String status;
  final int workedSeconds;
  final String? complaint;
  final String? complaintStatus;

  bool get hasOpenComplaint => complaint != null && complaintStatus != 'RESOLVED';
  bool get hasResolvedComplaint => complaint != null && complaintStatus == 'RESOLVED';

  /// Mốc tan ca, tính bằng **UTC**, dựng từ ngày làm việc + giờ kết thúc của mẫu ca trên đồng hồ
  /// Asia/Bangkok. Bản Dart của `shiftEndInstant` (`lib/usecases/attendanceAutoClose.ts` phía web):
  /// ca qua đêm (`22:00–06:00`) tan ở ngày hôm sau, mẫu 0 giờ (`Nghỉ`) không có mốc tan ca.
  DateTime? get shiftEndAt {
    final end = _minutesOf(shiftEnd);
    if (end == null) return null;
    final start = _minutesOf(shiftStart);
    if (start != null && start == end) return null;

    final d = workDate;
    var at = DateTime.utc(d.year, d.month, d.day, end ~/ 60 - 7, end % 60);
    if (start != null && end < start) {
      at = at.add(const Duration(days: 1));
    }
    return at;
  }

  /// Giờ ra **suy ra** khi ca đã tan mà quên chấm ra (`autoCheckOutAt`), tính bằng UTC.
  ///
  /// `null` khi đã có giờ ra thật, khi ca chưa tan (nhân viên còn bấm "Ra ca" được), khi mẫu ca
  /// không có giờ, hoặc khi đoạn làm hiện tại bắt đầu *sau* lúc ca tan — dựng một giờ ra trước giờ
  /// vào thì vô nghĩa, nên dòng đó để quản lý sửa.
  DateTime? autoCheckOutAt({DateTime? now}) {
    if (checkOutAt != null || checkInAt == null) return null;
    final end = shiftEndAt;
    if (end == null) return null;

    final at = now ?? DateTime.now().toUtc();
    if (end.isAfter(at)) return null;

    final segmentStart = resumedAt ?? checkInAt!;
    if (!end.isAfter(segmentStart)) return null;
    return end;
  }

  /// Giờ ra mà màn hình nên hiển thị: giờ thật, hoặc mốc tan ca khi ca đã hết (theo giờ máy).
  /// [now] chỉ để kiểm thử — mặc định là thời điểm hiện tại.
  DateTime? effectiveCheckOut({DateTime? now}) {
    final stored = checkOutAt;
    if (stored != null) return stored;
    return autoCheckOutAt(now: now)?.toLocal();
  }

  /// Giờ ra đang là suy ra chứ chưa ai bấm — màn hình ghi chú "(tự động)".
  bool isAutoClosed({DateTime? now}) =>
      checkOutAt == null && autoCheckOutAt(now: now) != null;

  /// Giây công đã tích luỹ (`worked_seconds`, SCRUM-69), có phương án dự phòng cho dòng ghi trước
  /// khi script chạy: khoảng giờ vào → giờ ra.
  int get _bankedSeconds {
    if (workedSeconds > 0) return workedSeconds;
    final inAt = checkInAt;
    final outAt = checkOutAt;
    if (inAt == null || outAt == null) return 0;
    final span = outAt.difference(inAt).inSeconds;
    return span < 0 ? 0 : span;
  }

  /// Giờ làm như mọi màn hình nên đọc: cộng đoạn đang mở tới lúc tan ca khi ca đã hết
  /// (`effectiveWorkedSeconds` của web, SCRUM-75/94) — nhờ vậy bảng công trên app, `/attendance`
  /// và phiếu lương không nói ba con số khác nhau.
  int effectiveWorkedSeconds({DateTime? now}) {
    final auto = autoCheckOutAt(now: now);
    final inAt = checkInAt;
    if (auto == null || inAt == null) return _bankedSeconds;

    final segment = auto.difference(resumedAt ?? inAt).inSeconds;
    return workedSeconds + (segment < 0 ? 0 : segment);
  }

  int effectiveWorkedMinutes({DateTime? now}) =>
      effectiveWorkedSeconds(now: now) ~/ 60;

  static const String columns =
      'id, work_date, check_in_at, check_out_at, resumed_at, status, worked_seconds, complaint, '
      'complaint_status, shift:shifts(name, start_time, end_time)';

  factory AttendanceRecord.fromJson(Map<String, dynamic> j) {
    final shiftRaw = j['shift'];
    Map<String, dynamic>? shift;
    if (shiftRaw is Map) shift = Map<String, dynamic>.from(shiftRaw);
    if (shiftRaw is List && shiftRaw.isNotEmpty && shiftRaw.first is Map) {
      shift = Map<String, dynamic>.from(shiftRaw.first as Map);
    }
    String? hm(dynamic t) {
      if (t == null) return null;
      final s = t.toString();
      return s.length >= 5 ? s.substring(0, 5) : s;
    }

    return AttendanceRecord(
      id: j['id'].toString(),
      workDate: parseDate(j['work_date']) ?? DateTime.now(),
      shiftName: shift?['name']?.toString(),
      shiftStart: hm(shift?['start_time']),
      shiftEnd: hm(shift?['end_time']),
      checkInAt: parseDate(j['check_in_at']),
      checkOutAt: parseDate(j['check_out_at']),
      resumedAt: parseDate(j['resumed_at']),
      status: (j['status'] ?? 'ON_TIME').toString(),
      workedSeconds: asInt(j['worked_seconds']),
      complaint: (j['complaint'] == null || j['complaint'].toString().isEmpty) ? null : j['complaint'].toString(),
      complaintStatus: j['complaint_status']?.toString(),
    );
  }
}

/// "08:30" / "08:30:00" → số phút trong ngày; chuỗi lạ → null (không có kết luận nào).
int? _minutesOf(String? hm) {
  if (hm == null) return null;
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(hm.trim());
  if (m == null) return null;

  final hours = int.tryParse(m.group(1)!);
  final minutes = int.tryParse(m.group(2)!);
  if (hours == null || minutes == null || hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}
