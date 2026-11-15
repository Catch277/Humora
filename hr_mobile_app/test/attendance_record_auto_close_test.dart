import 'package:flutter_test/flutter_test.dart';

import 'package:hr_mobile_app/data/models/attendance_record.dart';

AttendanceRecord _record({
  required DateTime workDate,
  String? start,
  String? end,
  DateTime? checkInAt,
  DateTime? checkOutAt,
  DateTime? resumedAt,
  int workedSeconds = 0,
}) =>
    AttendanceRecord(
      id: 'a',
      workDate: workDate,
      shiftName: 'Ca sáng',
      shiftStart: start,
      shiftEnd: end,
      checkInAt: checkInAt,
      checkOutAt: checkOutAt,
      resumedAt: resumedAt,
      status: 'ON_TIME',
      workedSeconds: workedSeconds,
      complaint: null,
      complaintStatus: null,
    );

/// The rule mirrored from `hr_website/lib/usecases/attendanceAutoClose.ts` (SCRUM-75/94). Timestamps are
/// built in UTC so the expectations hold on a machine in any timezone: the model compares instants, and
/// the ca's end is the Bangkok wall clock (`08:30–12:30` → `UTC 05:30`).
void main() {
  final workDate = DateTime(2026, 11, 15);
  final caEnd = DateTime.utc(2026, 11, 15, 5, 30); // 12:30 Asia/Bangkok
  final arrived = DateTime.utc(2026, 11, 15, 1, 31); // 08:31 Asia/Bangkok
  final after = DateTime.utc(2026, 11, 15, 6, 0); // 13:00 Bangkok, sau khi ca tan
  final early = DateTime.utc(2026, 11, 15, 3, 0); // 10:00 Bangkok, ca còn chạy

  test('ca đã tan mà quên chấm ra: giờ ra là mốc tan ca, giờ làm tính tới đó', () {
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: arrived,
    );

    final auto = r.autoCheckOutAt(now: after);

    expect(auto, caEnd);
    expect(r.isAutoClosed(now: after), isTrue);
    expect(r.effectiveCheckOut(now: after)?.toUtc(), caEnd);
    expect(r.effectiveWorkedSeconds(now: after), caEnd.difference(arrived).inSeconds);
    expect(r.effectiveWorkedMinutes(now: after), 239); // 3 giờ 59 phút
  });

  test('ca chưa tan: không suy ra giờ ra, giờ làm bằng 0', () {
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: arrived,
    );

    expect(r.autoCheckOutAt(now: early), isNull);
    expect(r.effectiveCheckOut(now: early), isNull);
    expect(r.isAutoClosed(now: early), isFalse);
    expect(r.effectiveWorkedSeconds(now: early), 0);
  });

  test('giờ ra thật luôn thắng mốc tan ca', () {
    final left = DateTime.utc(2026, 11, 15, 4, 10);
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: arrived,
      checkOutAt: left,
    );

    expect(r.autoCheckOutAt(now: after), isNull);
    expect(r.isAutoClosed(now: after), isFalse);
    expect(r.effectiveCheckOut(now: after), left);
    expect(r.effectiveWorkedSeconds(now: after), left.difference(arrived).inSeconds);
  });

  test('ca qua đêm tan ở ngày hôm sau', () {
    final r = _record(
      workDate: workDate,
      start: '22:00',
      end: '06:00',
      checkInAt: DateTime.utc(2026, 11, 15, 15, 5), // 22:05 Bangkok
    );

    expect(r.autoCheckOutAt(now: DateTime.utc(2026, 11, 15, 22, 0)), isNull);
    expect(
      r.autoCheckOutAt(now: DateTime.utc(2026, 11, 15, 23, 30)),
      DateTime.utc(2026, 11, 15, 23, 0), // 06:00 Bangkok ngày 16
    );
  });

  test('mẫu 0 giờ ("Nghỉ") và mẫu không có giờ: không có mốc tan ca', () {
    final dayOff = _record(
      workDate: workDate,
      start: '00:00',
      end: '00:00',
      checkInAt: arrived,
    );
    final noHours = _record(workDate: workDate, checkInAt: arrived);

    expect(dayOff.autoCheckOutAt(now: DateTime.utc(2026, 11, 15, 6, 0)), isNull);
    expect(noHours.autoCheckOutAt(now: DateTime.utc(2026, 11, 15, 6, 0)), isNull);
  });

  test('đoạn làm bắt đầu sau lúc ca tan: không dựng giờ ra trước giờ vào', () {
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: DateTime.utc(2026, 11, 15, 6, 30), // 13:30 Bangkok, sau khi ca tan
    );

    expect(r.autoCheckOutAt(now: DateTime.utc(2026, 11, 15, 8, 0)), isNull);
    expect(r.effectiveCheckOut(now: DateTime.utc(2026, 11, 15, 8, 0)), isNull);
  });

  test('đã tích luỹ giờ công: cộng thêm đoạn đang mở tới lúc tan ca', () {
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: DateTime.utc(2026, 11, 15, 1, 30), // 08:30
      resumedAt: DateTime.utc(2026, 11, 15, 3, 0), // 10:00, sau một lần vào ca lại
      workedSeconds: 1800, // 30 phút đã ra ca trước đó
    );

    // 30 phút đã tích luỹ + 10:00 → 12:30 = 150 phút.
    expect(r.effectiveWorkedSeconds(now: after), 1800 + 150 * 60);
    expect(r.effectiveWorkedMinutes(now: after), 180);
  });

  test('dòng ghi trước SCRUM-69 (worked_seconds = 0): dùng khoảng vào → ra', () {
    final r = _record(
      workDate: workDate,
      start: '08:30',
      end: '12:30',
      checkInAt: DateTime.utc(2026, 11, 15, 1, 30),
      checkOutAt: DateTime.utc(2026, 11, 15, 5, 0),
    );

    expect(r.effectiveWorkedMinutes(), 210);
  });
}
