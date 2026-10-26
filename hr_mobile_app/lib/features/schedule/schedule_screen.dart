import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/ui_kit.dart';
import '../../data/services/schedule_service.dart';
import '../../routes/app_routers.dart';
import '../../widgets/bottom_nav_bar.dart';
import 'shift_status.dart';

DateTime _mondayOf(DateTime d) {
  final day = dateOnly(d);
  return DateTime(day.year, day.month, day.day - (day.weekday - 1));
}

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  final ScheduleService _service = ScheduleService();
  DateTime _monday = _mondayOf(DateTime.now());
  DateTime _selected = dateOnly(DateTime.now());
  bool _loading = true;
  String? _error;
  List<ScheduledShift> _shifts = const [];
  int _loadToken = 0; // bỏ kết quả của lần tải cũ khi người dùng đổi tuần nhanh

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = ++_loadToken;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.week(_monday);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _shifts = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _moveWeek(int delta) {
    final next = DateTime(_monday.year, _monday.month, _monday.day + 7 * delta);
    final today = dateOnly(DateTime.now());
    setState(() {
      _monday = next;
      final inWeek = !today.isBefore(next) && !today.isAfter(DateTime(next.year, next.month, next.day + 6));
      _selected = inWeek ? today : next;
    });
    _load();
  }

  void _goThisWeek() {
    final today = dateOnly(DateTime.now());
    setState(() {
      _monday = _mondayOf(today);
      _selected = today;
    });
    _load();
  }

  Future<void> _openRegister() async {
    final done = await Navigator.pushNamed(context, AppRoutes.shift_register);
    if (!mounted) return;
    if (done == true) {
      showAppSnack(context, 'Đã gửi đăng ký ca, chờ quản lý duyệt.');
    }
    _load(); // luôn đồng bộ lại: có thể đã đăng ký một phần
  }

  Future<void> _requestLeave() async {
    await Navigator.pushNamed(context, AppRoutes.leave_request_employee);
    if (mounted) _load();
  }

  List<DateTime> get _days => List.generate(7, (i) => DateTime(_monday.year, _monday.month, _monday.day + i));

  List<ScheduledShift> _on(DateTime day) => _shifts.where((s) => sameDay(s.workDate, day)).toList();

  Map<DateTime, DayMark> _marks() {
    final m = <DateTime, DayMark>{};
    for (final d in _days) {
      final items = _on(d);
      if (items.isEmpty) continue;
      if (items.any(countsAsWorkShift)) {
        m[d] = const DayMark(Icons.event_available_rounded, AppColors.primary, 'có ca');
      } else if (items.any((s) => s.isRegistration && s.status != 'REJECTED')) {
        m[d] = const DayMark(Icons.hourglass_top_rounded, AppColors.warning, 'chờ duyệt');
      } else if (items.any((s) => s.status == 'LEAVE')) {
        m[d] = const DayMark(Icons.beach_access_outlined, AppColors.textSecondary, 'nghỉ phép');
      }
    }
    return m;
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Lịch làm việc của tôi',
      showBack: false,
      bottomNavigationBar: const BottomNavBar(currentIndex: 2),
      child: Column(
        children: [
          _weekSwitcher(),
          const SizedBox(height: 4),
          DayStrip(
            days: _days,
            selected: _selected,
            marks: _marks(),
            onSelect: (d) => setState(() => _selected = d),
          ),
          const SizedBox(height: 4),
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
              label: 'Đăng ký ca mới',
              icon: Icons.add_rounded,
              onPressed: _openRegister,
            ),
          ),
        ],
      ),
    );
  }

  Widget _weekSwitcher() {
    final sunday = DateTime(_monday.year, _monday.month, _monday.day + 6);
    final isCurrent = sameDay(_monday, _mondayOf(DateTime.now()));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            IconButton(
              onPressed: () => _moveWeek(-1),
              icon: const Icon(Icons.chevron_left_rounded),
              tooltip: 'Tuần trước',
            ),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${formatDayMonth(_monday)} - ${formatDayMonth(sunday)}/${sunday.year}',
                    style: AppText.title,
                  ),
                  const SizedBox(height: 2),
                  if (isCurrent)
                    const Text('Tuần này', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary))
                  else
                    GestureDetector(
                      onTap: _goThisWeek,
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 2),
                        child: Text('Về tuần này',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
                      ),
                    ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => _moveWeek(1),
              icon: const Icon(Icons.chevron_right_rounded),
              tooltip: 'Tuần sau',
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    final work = _shifts.where(countsAsWorkShift).toList();
    final minutes = work.fold<int>(0, (s, x) => s + shiftMinutes(x.start, x.end));
    final pending = _shifts.where((s) => s.isRegistration && s.status == 'PENDING').length;
    final items = _on(_selected);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      children: [
        Row(
          children: [
            Expanded(child: StatCard(label: 'Tổng số ca', value: '${work.length}', icon: Icons.event_available_outlined)),
            const SizedBox(width: 10),
            Expanded(child: StatCard(label: 'Tổng số giờ', value: formatMinutes(minutes), icon: Icons.schedule_outlined)),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Chờ duyệt',
                value: '$pending',
                icon: Icons.hourglass_top_rounded,
                color: AppColors.warning,
                background: AppColors.warningSoft,
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        SectionTitle(
          '${weekdayName(_selected)}, ${formatDayMonth(_selected)}',
          trailing: sameDay(_selected, DateTime.now()) ? const StatusPill('Hôm nay', tone: PillTone.info) : null,
        ),
        if (items.isEmpty) _emptyDay() else ...items.map(_shiftCard),
      ],
    );
  }

  Widget _emptyDay() {
    return AppCard(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle),
            child: const Icon(Icons.event_busy_outlined, color: AppColors.primary, size: 26),
          ),
          const SizedBox(height: 12),
          const Text('Không có ca trong ngày này', style: AppText.title),
          const SizedBox(height: 4),
          const Text('Bạn có thể đăng ký thêm ca làm cho ngày sắp tới.',
              style: AppText.bodyMuted, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          SecondaryButton(label: 'Đăng ký ca', icon: Icons.add_rounded, onPressed: _openRegister),
        ],
      ),
    );
  }

  Widget _shiftCard(ScheduledShift s) {
    final canLeave = countsAsWorkShift(s) && !s.workDate.isBefore(dateOnly(DateTime.now()));
    return ShiftCard(
      name: s.name,
      start: s.start,
      end: s.end,
      badge: shiftStatusPill(s),
      onTap: () => _showDetail(s),
      footer: Row(
        children: [
          Expanded(
            child: TextButton.icon(
              onPressed: () => _showDetail(s),
              icon: const Icon(Icons.info_outline_rounded, size: 16),
              label: const Text('Chi tiết'),
            ),
          ),
          if (canLeave)
            Expanded(
              child: TextButton.icon(
                onPressed: _requestLeave,
                icon: const Icon(Icons.event_busy_outlined, size: 16),
                label: const Text('Xin nghỉ'),
                style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              ),
            ),
        ],
      ),
    );
  }

  void _showDetail(ScheduledShift s) {
    final info = shiftStatusInfo(s);
    Widget row(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 7),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 104, child: Text(k, style: AppText.bodyMuted)),
              Expanded(child: Text(v, style: AppText.body.copyWith(fontWeight: FontWeight.w600))),
            ],
          ),
        );

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(s.name, style: AppText.h2)),
                  StatusPill(info.label, tone: info.tone, icon: info.icon),
                ],
              ),
              const SizedBox(height: 10),
              row('Ngày', '${weekdayName(s.workDate)}, ${formatDate(s.workDate)}'),
              row('Giờ làm', '${s.start} - ${s.end}'),
              row('Thời lượng', formatMinutes(shiftMinutes(s.start, s.end))),
              row('Loại', s.isRegistration ? 'Đăng ký ca (chờ quản lý xử lý)' : 'Ca do quản lý phân'),
            ],
          ),
        ),
      ),
    );
  }
}
