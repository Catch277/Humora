import 'package:flutter_test/flutter_test.dart';

import 'package:hr_mobile_app/data/services/attendance_photo_path.dart';

/// `attendance_clock_in` derives `work_date` from the submitted instant on the Bangkok clock and compares
/// the first three segments of the path against it (SCRUM-96). A path built from the device's local date —
/// or one day off — answers `ATT_PHOTO_PATH_INVALID`, so the boundary is what this test pins down.
void main() {
  const org = '11111111-1111-4111-8111-111111111111';
  const employee = '22222222-2222-4222-8222-222222222222';

  test('đường dẫn đúng quy ước <org>/<nhân viên>/<ngày>/<in|out>-<iso>.jpg', () {
    final path = attendancePhotoPath(
      organizationId: org,
      employeeId: employee,
      at: DateTime.utc(2026, 11, 15, 1, 31),
      checkIn: true,
    );

    expect(path, startsWith('$org/$employee/2026-11-15/in-'));
    expect(path, endsWith('.jpg'));
    expect(path, isNot(contains(':')));
  });

  test('chấm ra dùng tiền tố out-', () {
    final path = attendancePhotoPath(
      organizationId: org,
      employeeId: employee,
      at: DateTime.utc(2026, 11, 15, 1, 31),
      checkIn: false,
    );

    expect(path, contains('/out-'));
  });

  test('ngày là ngày Bangkok của chính thời điểm gửi lên', () {
    // 18:30 UTC ngày 15 = 01:30 sáng 16 ở Bangkok: `p_check_in_at` cho ra work_date 16.
    final path = attendancePhotoPath(
      organizationId: org,
      employeeId: employee,
      at: DateTime.utc(2026, 11, 15, 18, 30),
      checkIn: true,
    );

    expect(path, startsWith('$org/$employee/2026-11-16/in-'));
  });

  test('thiếu tổ chức, thiếu nhân viên, hoặc có dấu / → không có đường dẫn', () {
    final at = DateTime.utc(2026, 11, 15, 1, 31);

    expect(
      attendancePhotoPath(organizationId: '', employeeId: employee, at: at, checkIn: true),
      isNull,
    );
    expect(
      attendancePhotoPath(organizationId: org, employeeId: '  ', at: at, checkIn: true),
      isNull,
    );
    expect(
      attendancePhotoPath(organizationId: 'a/b', employeeId: employee, at: at, checkIn: true),
      isNull,
    );
  });
}
