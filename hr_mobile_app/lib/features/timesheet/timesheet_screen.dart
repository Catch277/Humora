import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/ui_kit.dart';
import '../../data/models/attendance_record.dart';
import '../../data/services/attendance_service.dart';
import '../../data/services/schedule_service.dart';
import '../../widgets/bottom_nav_bar.dart';
import '../schedule/shift_status.dart';

enum _Filter { all, onTime, late, early, absent }

const Map<_Filter, String> _filterLabels = {
  _Filter.all: 'Tất cả',
  _Filter.onTime: 'Đúng giờ',
  _Filter.late: 'Đi trễ',
  _Filter.early: 'Về sớm',
  _Filter.absent: 'Vắng / thiếu giờ ra',
};

bool _matches(AttendanceRecord r, _Filter f) {
  switch (f) {
    case _Filter.all:
      return true;
    case _Filter.onTime:
      return r.status == 'ON_TIME';
    case _Filter.late:
      return r.status == 'LATE';
    case _Filter.early:
      return r.status == 'EARLY_LEAVE';
    case _Filter.absent:
      return r.status == 'ABSENT' || r.status == 'INCOMPLETE';
  }
}

class TimesheetScreen extends StatefulWidget {
  const TimesheetScreen({super.key});

  @override
  State<TimesheetScreen> createState() => _TimesheetScreenState();
}

class _TimesheetScreenState extends State<TimesheetScreen> {
  final AttendanceService _service = AttendanceService();
  final ScheduleService _schedule = ScheduleService();

  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime? _selectedDay;
  _Filter _filter = _Filter.all;

  bool _loading = true;
  String? _error;
  List<AttendanceRecord> _rows = const [];
  List<ScheduledShift> _scheduled = const []; // chỉ dùng để phân biệt "ngày có ca" và "ngày không có ca"
  int _token = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = ++_token;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await _service.month(_month);
      List<ScheduledShift> sched = const [];
      try {
        sched = await _schedule.range(_month, DateTime(_month.year, _month.month + 1, 0));
      } catch (_) {
        // Không có lịch ca vẫn hiển thị được bảng công; chỉ thiếu dấu "có ca".
      }
      if (!mounted || token != _token) return;
      setState(() {
        _rows = rows;
        _scheduled = sched;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || token != _token) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  DateTime get _maxMonth => DateTime(DateTime.now().year, DateTime.now().month, 1);

  void _setMonth(DateTime m) {
    if (m.isAfter(_maxMonth)) return;
    setState(() {
      _month = DateTime(m.year, m.month, 1);
      _selectedDay = null;
    });
    _load();
  }

  void _shift(int delta) => _setMonth(DateTime(_month.year, _month.month + delta, 1));

  Future<void> _pickMonth() async {
    final m = await showMonthYearPicker(context, initial: _month, maxMonth: _maxMonth);
    if (m != null && mounted && (m.year != _month.year || m.month != _month.month)) _setMonth(m);
  }

  Future<void> _complain(AttendanceRecord r) async {
    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _ComplaintSheet(),
    );
    if (text == null || !mounted) return;
    try {
      await _service.complain(r.id, text);
      if (!mounted) return;
      showAppSnack(context, 'Đã gửi đơn tới quản lý.');
      _load();
    } catch (e) {
      if (mounted) showAppSnack(context, e.toString(), error: true);
    }
  }

  /// "Gửi đơn bổ sung công": hiện các ngày đã có bản ghi bất thường để gửi đơn (dùng cơ chế khiếu nại hiện có).
  Future<void> _openSupplement() async {
    final eligible = _rows.where((r) => r.status != 'ON_TIME' && !r.hasOpenComplaint).toList();
    final picked = await showModalBottomSheet<AttendanceRecord>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SupplementSheet(records: eligible),
    );
    if (picked != null && mounted) _complain(picked);
  }

  // ---------- Dữ liệu cho lịch ----------

  (String, PillTone, IconData) _statusInfo(AttendanceRecord r) {
    switch (r.status) {
      case 'LATE':
        return ('Đi trễ', PillTone.warning, Icons.schedule_rounded);
      case 'EARLY_LEAVE':
        return ('Về sớm', PillTone.warning, Icons.logout_rounded);
      case 'ABSENT':
        return ('Vắng', PillTone.danger, Icons.cancel_outlined);
      case 'INCOMPLETE':
        return ('Thiếu giờ ra', PillTone.danger, Icons.error_outline_rounded);
      default:
        return ('Đúng giờ', PillTone.success, Icons.check_circle_outline_rounded);
    }
  }

  Map<DateTime, DayMark> _marks() {
    final m = <DateTime, DayMark>{};
    for (final s in _scheduled) {
      if (countsAsWorkShift(s)) m[dateOnly(s.workDate)] = kMarkScheduled;
    }
    final byDay = <DateTime, List<AttendanceRecord>>{};
    for (final r in _rows) {
      byDay.putIfAbsent(dateOnly(r.workDate), () => []).add(r);
    }
    byDay.forEach((d, list) => m[d] = markForRecords(list));
    return m;
  }

  List<AttendanceRecord> get _visible => _rows
      .where((r) => _matches(r, _filter) && (_selectedDay == null || sameDay(r.workDate, _selectedDay!)))
      .toList();

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Bảng công',
      subtitle: 'Giờ làm thực tế của bạn',
      showBack: false,
      bottomNavigationBar: const BottomNavBar(currentIndex: 1),
      child: Column(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 8), child: _monthSwitcher()),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              builder: (_) => RefreshIndicator(onRefresh: _load, child: _body()),
            ),
          ),
          BottomActionBar(
            child: PrimaryButton(
              label: 'Gửi đơn bổ sung công',
              icon: Icons.edit_note_rounded,
              onPressed: _openSupplement,
            ),
          ),
        ],
      ),
    );
  }

  Widget _monthSwitcher() {
    final isCurrent = _month.year == _maxMonth.year && _month.month == _maxMonth.month;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => _shift(-1),
            icon: const Icon(Icons.chevron_left_rounded),
            tooltip: 'Tháng trước',
          ),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: _pickMonth,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Tháng ${formatMonthYear(_month)}', style: AppText.title),
                    const SizedBox(width: 4),
                    const Icon(Icons.expand_more_rounded, size: 20, color: AppColors.textSecondary),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: isCurrent ? null : () => _shift(1),
            icon: const Icon(Icons.chevron_right_rounded),
            tooltip: 'Tháng sau',
          ),
        ],
      ),
    );
  }

  Widget _p(Widget w) => Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: w);

  Widget _body() {
    final worked = _rows.where((r) => r.checkOutAt != null).toList();
    final totalMinutes = worked.fold<int>(0, (s, r) => s + r.workedMinutes);
    final late = _rows.where((r) => r.status == 'LATE').length;
    final early = _rows.where((r) => r.status == 'EARLY_LEAVE').length;
    final counts = {for (final f in _Filter.values) f: _rows.where((r) => _matches(r, f)).length};
    final list = _visible;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(top: 4, bottom: 20),
      children: [
        _p(Row(
          children: [
            Expanded(child: StatCard(label: 'Số ca đã làm', value: '${worked.length}', icon: Icons.event_available_outlined)),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Đi trễ / về sớm',
                value: '$late / $early',
                icon: Icons.running_with_errors_outlined,
                color: AppColors.warning,
                background: AppColors.warningSoft,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(child: StatCard(label: 'Tổng giờ làm', value: formatMinutes(totalMinutes), icon: Icons.schedule_outlined)),
          ],
        )),
        const SizedBox(height: 14),
        _p(MonthCalendar(
          month: _month,
          selected: _selectedDay,
          marks: _marks(),
          onSelect: (d) => setState(() => _selectedDay = (_selectedDay != null && sameDay(_selectedDay!, d)) ? null : d),
        )),
        const SizedBox(height: 10),
        _p(const CalendarLegend(items: [kMarkOnTime, kMarkLateEarly, kMarkAbsent, kMarkScheduled])),
        const SizedBox(height: 16),
        FilterChipsRow<_Filter>(
          options: _filterLabels,
          value: _filter,
          counts: counts,
          onChanged: (f) => setState(() => _filter = f),
        ),
        const SizedBox(height: 14),
        _p(SectionTitle(
          'Nhật ký chấm công',
          trailing: _selectedDay == null
              ? null
              : ActionChip(
                  label: Text('Ngày ${formatDayMonth(_selectedDay!)}'),
                  avatar: const Icon(Icons.close_rounded, size: 16),
                  onPressed: () => setState(() => _selectedDay = null),
                  backgroundColor: AppColors.primarySoft,
                  side: BorderSide.none,
                ),
        )),
        if (list.isEmpty)
          _p(AppCard(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: Text(
                  _rows.isEmpty
                      ? 'Tháng này chưa có dữ liệu chấm công'
                      : (_selectedDay != null
                          ? 'Ngày ${formatDayMonth(_selectedDay!)} chưa có bản ghi nào phù hợp'
                          : 'Không có bản ghi nào theo bộ lọc này'),
                  style: AppText.bodyMuted,
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ))
        else
          ...list.map((r) => _p(_card(r))),
      ],
    );
  }

  Widget _card(AttendanceRecord r) {
    final (label, tone, icon) = _statusInfo(r);
    final inT = r.checkInAt == null ? '--:--' : formatTime(r.checkInAt!);
    final outT = r.checkOutAt == null ? '--:--' : formatTime(r.checkOutAt!);

    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${weekdayName(r.workDate)}, ${formatDayMonth(r.workDate)}', style: AppText.title),
              ),
              StatusPill(label, tone: tone, icon: icon),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            r.shiftName == null
                ? 'Chưa gắn ca'
                : '${r.shiftName}${r.shiftStart != null ? ' (${r.shiftStart} - ${r.shiftEnd})' : ''}',
            style: AppText.bodyMuted,
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: AppColors.surfaceMuted, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Expanded(child: _time('Vào', inT)),
                Expanded(child: _time('Ra', outT)),
                Expanded(child: _time('Giờ làm', r.checkOutAt == null ? '--' : formatMinutes(r.workedMinutes))),
              ],
            ),
          ),
          if (r.status == 'INCOMPLETE')
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('Chưa có giờ ra. Hãy gửi đơn để quản lý bổ sung.', style: AppText.caption),
            ),
          if (r.hasOpenComplaint)
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: StatusPill('Đơn đang chờ xử lý', tone: PillTone.warning, icon: Icons.hourglass_top_rounded),
            )
          else ...[
            if (r.hasResolvedComplaint)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: StatusPill('Đơn đã được xử lý', tone: PillTone.success, icon: Icons.check_circle_outline_rounded),
              ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _complain(r),
                icon: const Icon(Icons.flag_outlined, size: 16),
                label: const Text('Khiếu nại'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _time(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppText.caption),
        const SizedBox(height: 2),
        Text(value, style: AppText.money.copyWith(fontSize: 14)),
      ],
    );
  }
}

/// Chọn một bản ghi bất thường để gửi đơn.
class _SupplementSheet extends StatelessWidget {
  const _SupplementSheet({required this.records});
  final List<AttendanceRecord> records;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Gửi đơn bổ sung công', style: AppText.h2),
            const SizedBox(height: 6),
            const Text('Chọn ngày cần bổ sung hoặc điều chỉnh. Quản lý sẽ xem xét đơn của bạn.', style: AppText.bodyMuted),
            const SizedBox(height: 12),
            const InfoBanner(
              text: 'Hiện chỉ gửi đơn được cho ngày đã có bản ghi chấm công. Bổ sung cho ngày chưa có bản ghi đang chờ máy chủ hỗ trợ.',
            ),
            const SizedBox(height: 12),
            if (records.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Text('Không có ngày nào cần gửi đơn trong tháng này.', style: AppText.bodyMuted, textAlign: TextAlign.center),
                ),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: records.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final r = records[i];
                    final inT = r.checkInAt == null ? '--:--' : formatTime(r.checkInAt!);
                    final outT = r.checkOutAt == null ? '--:--' : formatTime(r.checkOutAt!);
                    return AppCard(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      onTap: () => Navigator.pop(context, r),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${weekdayName(r.workDate)}, ${formatDayMonth(r.workDate)}', style: AppText.title),
                                const SizedBox(height: 2),
                                Text('Vào $inT • Ra $outT', style: AppText.caption),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ComplaintSheet extends StatefulWidget {
  const _ComplaintSheet();

  @override
  State<_ComplaintSheet> createState() => _ComplaintSheetState();
}

class _ComplaintSheetState extends State<_ComplaintSheet> {
  final TextEditingController _text = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _submit() {
    final t = _text.text.trim();
    if (t.length < 5) {
      setState(() => _error = 'Hãy mô tả cụ thể hơn (ít nhất 5 ký tự).');
      return;
    }
    Navigator.pop(context, t);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Gửi đơn / khiếu nại bảng công', style: AppText.h2),
            const SizedBox(height: 6),
            const Text('Mô tả giờ vào/ra đúng của bạn. Quản lý sẽ xem xét và sửa nếu cần.', style: AppText.bodyMuted),
            const SizedBox(height: 14),
            TextField(
              controller: _text,
              maxLines: 4,
              maxLength: 500,
              autofocus: true,
              decoration: InputDecoration(
                errorText: _error,
                filled: true,
                fillColor: AppColors.surfaceMuted,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 12),
            PrimaryButton(label: 'Gửi đơn', icon: Icons.send_rounded, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
