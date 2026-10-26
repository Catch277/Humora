import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/ui_kit.dart';
import '../../data/models/attendance_record.dart';
import '../../data/services/attendance_service.dart';
import '../../data/services/schedule_service.dart';
import '../../features/schedule/shift_status.dart';
import '../../routes/app_routers.dart';

/// Lịch tuần nhỏ: trạng thái từng ngày trong tuần (công thật + ca được phân).
class WeekStatusCard extends StatefulWidget {
  const WeekStatusCard({super.key, this.refreshTick = 0});

  /// Tăng giá trị này để tải lại (kéo-để-làm-mới ở trang chủ).
  final int refreshTick;

  @override
  State<WeekStatusCard> createState() => _WeekStatusCardState();
}

class _WeekStatusCardState extends State<WeekStatusCard> {
  final AttendanceService _attendance = AttendanceService();
  final ScheduleService _schedule = ScheduleService();

  bool _loading = true;
  String? _error;
  Map<DateTime, DayMark> _marks = const {};

  DateTime get _monday {
    final t = dateOnly(DateTime.now());
    return DateTime(t.year, t.month, t.day - (t.weekday - 1));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant WeekStatusCard old) {
    super.didUpdateWidget(old);
    if (old.refreshTick != widget.refreshTick) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final monday = _monday;
      final sunday = DateTime(monday.year, monday.month, monday.day + 6);

      final records = <AttendanceRecord>[...await _attendance.month(monday)];
      if (sunday.month != monday.month) records.addAll(await _attendance.month(sunday));

      List<ScheduledShift> shifts = const [];
      try {
        shifts = await _schedule.week(monday);
      } catch (_) {
        // Thiếu lịch ca thì vẫn hiện được công đã chấm.
      }

      final marks = <DateTime, DayMark>{};
      for (final s in shifts) {
        if (countsAsWorkShift(s)) marks[dateOnly(s.workDate)] = kMarkScheduled;
      }
      final byDay = <DateTime, List<AttendanceRecord>>{};
      for (final r in records) {
        final d = dateOnly(r.workDate);
        if (d.isBefore(monday) || d.isAfter(sunday)) continue;
        byDay.putIfAbsent(d, () => []).add(r);
      }
      byDay.forEach((d, list) => marks[d] = markForRecords(list));

      if (!mounted) return;
      setState(() {
        _marks = marks;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final today = dateOnly(DateTime.now());
    final m = _monday;
    final days = List.generate(7, (i) => DateTime(m.year, m.month, m.day + i));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(child: Text('Tuần này', style: AppText.h2)),
                TextButton(
                  onPressed: () => Navigator.pushNamed(context, AppRoutes.work_schedule_employee),
                  child: const Text('Xem lịch'),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (_loading)
              const SizedBox(height: 74, child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)))
            else if (_error != null)
              Row(
                children: [
                  Expanded(child: Text(_error!, style: AppText.bodyMuted)),
                  TextButton(onPressed: _load, child: const Text('Thử lại')),
                ],
              )
            else ...[
              Row(
                children: [
                  for (final d in days)
                    Expanded(child: _cell(d, today, _marks[d])),
                ],
              ),
              const SizedBox(height: 12),
              const CalendarLegend(items: [kMarkOnTime, kMarkLateEarly, kMarkAbsent, kMarkScheduled]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _cell(DateTime d, DateTime today, DayMark? mark) {
    final isToday = sameDay(d, today);
    return Semantics(
      label: '${weekdayName(d)} ${formatDayMonth(d)}${isToday ? ', hôm nay' : ''}${mark != null ? ', ${mark.label}' : ''}',
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isToday ? AppColors.primary : AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(
              weekdayShort(d),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isToday ? Colors.white70 : AppColors.textMuted),
            ),
            const SizedBox(height: 3),
            Text(
              '${d.day}',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: isToday ? Colors.white : AppColors.textPrimary),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 14,
              child: mark == null ? null : Icon(mark.icon, size: 14, color: isToday ? Colors.white : mark.color),
            ),
          ],
        ),
      ),
    );
  }
}
