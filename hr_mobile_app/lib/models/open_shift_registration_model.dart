class OpenShiftRegistrationModel {
  final String id;
  final String dayOfWeek; // "Thứ 2", "Thứ 3", ...
  final String dateStr;
  final String shiftName; // "Ca sáng" hoặc "Ca chiều"
  final String shiftTime; // "08:30 - 12:30" hoặc "13:00 - 17:00"
  final String employeeName;
  final String employeeRole;
  final String status; // "Chờ duyệt", "Đã duyệt", ...

  OpenShiftRegistrationModel({
    required this.id,
    required this.dayOfWeek,
    required this.dateStr,
    required this.shiftName,
    required this.shiftTime,
    required this.employeeName,
    required this.employeeRole,
    this.status = 'Chờ duyệt',
  });

  // Chuyển dữ liệu từ Supabase về Map
  factory OpenShiftRegistrationModel.fromMap(Map<String, dynamic> map) {
    return OpenShiftRegistrationModel(
      id: map['id']?.toString() ?? '',
      dayOfWeek: map['day_of_week'] ?? 'Thứ 2',
      dateStr: map['date_str'] ?? '',
      shiftName: map['shift_name'] ?? 'Ca sáng',
      shiftTime: map['shift_time'] ?? '08:30 - 12:30',
      employeeName: map['employee_name'] ?? '',
      employeeRole: map['employee_role'] ?? 'Nhân viên',
      status: map['status'] ?? 'Chờ duyệt',
    );
  }

  // Chuyển Model sang Map để lưu vào Supabase
  Map<String, dynamic> toMap() {
    return {
      'day_of_week': dayOfWeek,
      'date_str': dateStr,
      'shift_name': shiftName,
      'shift_time': shiftTime,
      'employee_name': employeeName,
      'employee_role': employeeRole,
      'status': status,
    };
  }
}