import 'package:flutter/material.dart';

import '../../core/widgets/app_widgets.dart';
import '../../data/services/schedule_service.dart';

/// Nhãn trạng thái của một ca trong lịch (dùng chung cho lịch làm việc và đăng ký ca).
class ShiftStatusInfo {
  const ShiftStatusInfo(this.label, this.tone, this.icon);
  final String label;
  final PillTone tone;
  final IconData icon;
}

ShiftStatusInfo shiftStatusInfo(ScheduledShift s) {
  if (s.isRegistration) {
    return s.status == 'REJECTED'
        ? const ShiftStatusInfo('Bị từ chối', PillTone.danger, Icons.cancel_outlined)
        : const ShiftStatusInfo('Chờ duyệt', PillTone.warning, Icons.hourglass_top_rounded);
  }
  switch (s.status) {
    case 'LEAVE':
      return const ShiftStatusInfo('Nghỉ phép', PillTone.neutral, Icons.beach_access_outlined);
    case 'CANCELLED':
      return const ShiftStatusInfo('Đã huỷ', PillTone.neutral, Icons.block_rounded);
    default:
      return const ShiftStatusInfo('Đã xác nhận', PillTone.success, Icons.check_circle_outline_rounded);
  }
}

/// Ca có tính vào số ca / số giờ làm của tuần không (ca đã phân và còn hiệu lực).
bool countsAsWorkShift(ScheduledShift s) => !s.isRegistration && s.status == 'SCHEDULED';

StatusPill shiftStatusPill(ScheduledShift s) {
  final i = shiftStatusInfo(s);
  return StatusPill(i.label, tone: i.tone, icon: i.icon);
}
