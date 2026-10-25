import '../../core/format.dart';

/// Dòng ca đã được tính lương (bằng chứng để nhân viên đối chiếu).
class PayslipWorkLine {
  const PayslipWorkLine({
    required this.workDate,
    required this.shiftName,
    required this.minutes,
    required this.isOvertime,
    required this.hourlyRate,
    required this.multiplier,
    required this.amount,
  });

  final DateTime workDate;
  final String shiftName;
  final int minutes;
  final bool isOvertime;
  final int hourlyRate;
  final double multiplier;
  final int amount;

  factory PayslipWorkLine.fromJson(Map<String, dynamic> j) => PayslipWorkLine(
        workDate: parseDate(j['work_date']) ?? DateTime.now(),
        shiftName: (j['shift_name'] ?? 'Ca làm việc').toString(),
        minutes: asInt(j['minutes']),
        isOvertime: j['is_overtime'] == true,
        hourlyRate: asInt(j['hourly_rate']),
        multiplier: asDouble(j['multiplier'], 1),
        amount: asInt(j['amount']),
      );
}

/// Khoản phụ cấp / thưởng (EARNING) hoặc khấu trừ (DEDUCTION).
class PayslipItem {
  const PayslipItem({
    required this.kind,
    required this.code,
    required this.label,
    required this.amount,
  });

  final String kind;
  final String code;
  final String label;
  final int amount;

  bool get isDeduction => kind == 'DEDUCTION';

  factory PayslipItem.fromJson(Map<String, dynamic> j) => PayslipItem(
        kind: (j['kind'] ?? 'EARNING').toString(),
        code: (j['code'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        amount: asInt(j['amount']),
      );
}

/// Một phiếu lương (bản tóm tắt dùng cho danh sách, cũng là phần đầu của bản chi tiết).
class Payslip {
  const Payslip({
    required this.id,
    required this.periodStart,
    required this.periodEnd,
    required this.regularMinutes,
    required this.overtimeMinutes,
    required this.shiftsCounted,
    required this.shiftsSkipped,
    required this.workAmount,
    required this.otherEarnings,
    required this.grossAmount,
    required this.deductionAmount,
    required this.netAmount,
    required this.publishedAt,
    required this.acknowledgedAt,
    required this.disputeNote,
    required this.disputedAt,
    required this.disputeResolvedAt,
    this.workLines = const [],
    this.items = const [],
  });

  final String id;
  final DateTime periodStart;
  final DateTime periodEnd;
  final int regularMinutes;
  final int overtimeMinutes;
  final int shiftsCounted;
  final int shiftsSkipped;
  final int workAmount;
  final int otherEarnings;
  final int grossAmount;
  final int deductionAmount;
  final int netAmount;
  final DateTime? publishedAt;
  final DateTime? acknowledgedAt;
  final String? disputeNote;
  final DateTime? disputedAt;
  final DateTime? disputeResolvedAt;
  final List<PayslipWorkLine> workLines;
  final List<PayslipItem> items;

  bool get isAcknowledged => acknowledgedAt != null;
  bool get hasOpenDispute => disputedAt != null && disputeResolvedAt == null;
  bool get hadDispute => disputedAt != null;

  List<PayslipItem> get earnings => items.where((i) => !i.isDeduction).toList();
  List<PayslipItem> get deductions => items.where((i) => i.isDeduction).toList();

  /// Cột mà danh sách cần (không kéo cả chi tiết ca).
  static const String listColumns =
      'id, period_start, period_end, regular_minutes, overtime_minutes, shifts_counted, '
      'shifts_skipped, work_amount, other_earnings, gross_amount, deduction_amount, net_amount, '
      'published_at, acknowledged_at, dispute_note, disputed_at, dispute_resolved_at';

  factory Payslip.fromJson(Map<String, dynamic> j) {
    final lines = (j['payslip_work_lines'] as List?)
            ?.map((e) => PayslipWorkLine.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList() ??
        <PayslipWorkLine>[];
    lines.sort((a, b) => a.workDate.compareTo(b.workDate));
    final items = (j['payslip_items'] as List?)
            ?.map((e) => PayslipItem.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList() ??
        <PayslipItem>[];

    return Payslip(
      id: j['id'].toString(),
      periodStart: parseDate(j['period_start']) ?? DateTime.now(),
      periodEnd: parseDate(j['period_end']) ?? DateTime.now(),
      regularMinutes: asInt(j['regular_minutes']),
      overtimeMinutes: asInt(j['overtime_minutes']),
      shiftsCounted: asInt(j['shifts_counted']),
      shiftsSkipped: asInt(j['shifts_skipped']),
      workAmount: asInt(j['work_amount']),
      otherEarnings: asInt(j['other_earnings']),
      grossAmount: asInt(j['gross_amount']),
      deductionAmount: asInt(j['deduction_amount']),
      netAmount: asInt(j['net_amount']),
      publishedAt: parseDate(j['published_at']),
      acknowledgedAt: parseDate(j['acknowledged_at']),
      disputeNote: j['dispute_note']?.toString(),
      disputedAt: parseDate(j['disputed_at']),
      disputeResolvedAt: parseDate(j['dispute_resolved_at']),
      workLines: lines,
      items: items,
    );
  }
}

/// Thu nhập tạm tính của tháng đang làm (trước khấu trừ).
class PayEstimate {
  const PayEstimate({
    required this.periodStart,
    required this.periodEnd,
    required this.hasPayProfile,
    required this.regularMinutes,
    required this.overtimeMinutes,
    required this.shiftsCounted,
    required this.shiftsSkipped,
    required this.workAmount,
    required this.allowanceAmount,
    required this.grossEstimate,
  });

  final DateTime periodStart;
  final DateTime periodEnd;
  final bool hasPayProfile;
  final int regularMinutes;
  final int overtimeMinutes;
  final int shiftsCounted;
  final int shiftsSkipped;
  final int workAmount;
  final int allowanceAmount;
  final int grossEstimate;

  int get totalMinutes => regularMinutes + overtimeMinutes;

  factory PayEstimate.fromJson(Map<String, dynamic> j) => PayEstimate(
        periodStart: parseDate(j['period_start']) ?? DateTime.now(),
        periodEnd: parseDate(j['period_end']) ?? DateTime.now(),
        hasPayProfile: j['has_pay_profile'] == true,
        regularMinutes: asInt(j['regular_minutes']),
        overtimeMinutes: asInt(j['overtime_minutes']),
        shiftsCounted: asInt(j['shifts_counted']),
        shiftsSkipped: asInt(j['shifts_skipped']),
        workAmount: asInt(j['work_amount']),
        allowanceAmount: asInt(j['allowance_amount']),
        grossEstimate: asInt(j['gross_estimate']),
      );
}
