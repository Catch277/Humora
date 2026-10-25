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
  final String status;
  final int workedSeconds;
  final String? complaint;
  final String? complaintStatus;

  bool get hasOpenComplaint => complaint != null && complaintStatus != 'RESOLVED';
  bool get hasResolvedComplaint => complaint != null && complaintStatus == 'RESOLVED';
  int get workedMinutes => workedSeconds ~/ 60;

  static const String columns =
      'id, work_date, check_in_at, check_out_at, status, worked_seconds, complaint, '
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
      status: (j['status'] ?? 'ON_TIME').toString(),
      workedSeconds: asInt(j['worked_seconds']),
      complaint: (j['complaint'] == null || j['complaint'].toString().isEmpty) ? null : j['complaint'].toString(),
      complaintStatus: j['complaint_status']?.toString(),
    );
  }
}
