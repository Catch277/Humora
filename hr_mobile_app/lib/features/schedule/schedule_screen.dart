import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/services/schedule_service.dart';
import '../../widgets/bottom_nav_bar.dart';

DateTime _mondayOf(DateTime d) {
  final day = DateTime(d.year, d.month, d.day);
  return day.subtract(Duration(days: day.weekday - 1));
}

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  final ScheduleService _service = ScheduleService();
  DateTime _monday = _mondayOf(DateTime.now());
  bool _loading = true;
  String? _error;
  List<ScheduledShift> _shifts = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.week(_monday);
      if (!mounted) return;
      setState(() {
        _shifts = list;
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

  void _moveWeek(int delta) {
    setState(() => _monday = _monday.add(Duration(days: 7 * delta)));
    _load();
  }

  Future<void> _openRegister() async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RegisterSheet(service: _service),
    );
    if (done == true && mounted) {
      showAppSnack(context, 'Đã gửi đăng ký ca, chờ quản lý duyệt.');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Lịch làm việc',
      showBack: false,
      onRefresh: _load,
      bottomNavigationBar: const BottomNavBar(currentIndex: 1),
      child: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        builder: (_) => _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    final sunday = _monday.add(const Duration(days: 6));
    final today = DateTime.now();
    final todayKey = DateTime(today.year, today.month, today.day);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              IconButton(onPressed: () => _moveWeek(-1), icon: const Icon(Icons.chevron_left_rounded), tooltip: 'Tuần trước'),
              Expanded(
                child: Text(
                  '${formatDayMonth(_monday)} - ${formatDayMonth(sunday)}/${sunday.year}',
                  textAlign: TextAlign.center,
                  style: AppText.title,
                ),
              ),
              IconButton(onPressed: () => _moveWeek(1), icon: const Icon(Icons.chevron_right_rounded), tooltip: 'Tuần sau'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton.icon(
            onPressed: _openRegister,
            icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
            label: const Text('Đăng ký ca làm'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
        const SizedBox(height: 16),
        ...List.generate(7, (i) {
          final day = _monday.add(Duration(days: i));
          final items = _shifts
              .where((s) => s.workDate.year == day.year && s.workDate.month == day.month && s.workDate.day == day.day)
              .toList();
          return _dayCard(day, items, day == todayKey);
        }),
      ],
    );
  }

  Widget _dayCard(DateTime day, List<ScheduledShift> items, bool isToday) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      color: isToday ? AppColors.primarySoft : AppColors.surface,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(weekdayShort(day), style: AppText.caption.copyWith(color: isToday ? AppColors.primary : AppColors.textMuted)),
                const SizedBox(height: 2),
                Text('${day.day}', style: AppText.h2.copyWith(color: isToday ? AppColors.primary : AppColors.textPrimary)),
              ],
            ),
          ),
          Expanded(
            child: items.isEmpty
                ? const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text('Không có ca', style: AppText.bodyMuted),
                  )
                : Column(children: items.map(_shiftRow).toList()),
          ),
        ],
      ),
    );
  }

  Widget _shiftRow(ScheduledShift s) {
    String label;
    PillTone tone;
    if (s.isRegistration) {
      label = s.status == 'REJECTED' ? 'Bị từ chối' : 'Chờ duyệt';
      tone = s.status == 'REJECTED' ? PillTone.danger : PillTone.warning;
    } else if (s.status == 'LEAVE') {
      label = 'Nghỉ phép';
      tone = PillTone.neutral;
    } else if (s.status == 'CANCELLED') {
      label = 'Đã huỷ';
      tone = PillTone.neutral;
    } else {
      label = 'Đã phân ca';
      tone = PillTone.success;
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.name, style: AppText.title),
                Text('${s.start} - ${s.end}', style: AppText.caption),
              ],
            ),
          ),
          StatusPill(label, tone: tone),
        ],
      ),
    );
  }
}

class _RegisterSheet extends StatefulWidget {
  const _RegisterSheet({required this.service});
  final ScheduleService service;

  @override
  State<_RegisterSheet> createState() => _RegisterSheetState();
}

class _RegisterSheetState extends State<_RegisterSheet> {
  List<ShiftTemplate> _templates = const [];
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _shiftId;
  late DateTime _date;
  late final List<DateTime> _dates;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _dates = List.generate(14, (i) => today.add(Duration(days: i + 1)));
    _date = _dates.first;
    _load();
  }

  Future<void> _load() async {
    try {
      final t = await widget.service.templates();
      if (!mounted) return;
      setState(() {
        _templates = t;
        _shiftId = t.isEmpty ? null : t.first.id;
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

  Future<void> _submit() async {
    if (_shiftId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.register(shiftId: _shiftId!, date: _date);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      child: SafeArea(
        top: false,
        child: _loading
            ? const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Đăng ký ca làm', style: AppText.h2),
                  const SizedBox(height: 4),
                  const Text('Quản lý sẽ duyệt đăng ký của bạn.', style: AppText.bodyMuted),
                  const SizedBox(height: 16),
                  const Text('NGÀY', style: AppText.label),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 64,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _dates.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final d = _dates[i];
                        final sel = d == _date;
                        return InkWell(
                          onTap: () => setState(() => _date = d),
                          borderRadius: BorderRadius.circular(14),
                          child: Container(
                            width: 56,
                            decoration: BoxDecoration(
                              color: sel ? AppColors.primary : AppColors.surfaceMuted,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(weekdayShort(d),
                                    style: TextStyle(fontSize: 11, color: sel ? Colors.white70 : AppColors.textMuted)),
                                Text('${d.day}/${d.month}',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: sel ? Colors.white : AppColors.textPrimary)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('CA', style: AppText.label),
                  const SizedBox(height: 8),
                  if (_templates.isEmpty)
                    const Text('Chưa có ca nào để đăng ký.', style: AppText.bodyMuted)
                  else
                    ..._templates.map((t) => RadioListTile<String>(
                          value: t.id,
                          groupValue: _shiftId,
                          onChanged: (v) => setState(() => _shiftId = v),
                          title: Text(t.label),
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        )),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  ],
                  const SizedBox(height: 14),
                  PrimaryButton(label: 'Gửi đăng ký', busy: _busy, onPressed: _templates.isEmpty ? null : _submit),
                ],
              ),
      ),
    );
  }
}
