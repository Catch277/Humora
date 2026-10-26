import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/ui_kit.dart';
import '../../data/services/schedule_service.dart';
import 'shift_status.dart';

typedef _Pick = ({DateTime date, ShiftTemplate t});

DateTime _mondayOf(DateTime d) {
  final day = dateOnly(d);
  return DateTime(day.year, day.month, day.day - (day.weekday - 1));
}

/// Đăng ký ca làm: chọn nhiều ca ở nhiều ngày/tuần rồi gửi một lần.
///
/// Dữ liệu thật: danh sách ca (`shifts`), ca đã phân và đăng ký hiện có (`shift_assignments`, `shift_registrations`).
/// Backend hiện chưa có: lưu nháp, số chỗ còn trống, giới hạn số ca/tuần, điểm chuyên cần
/// → các phần này không được hiển thị để tránh số liệu giả.
class ShiftRegisterScreen extends StatefulWidget {
  const ShiftRegisterScreen({super.key});

  @override
  State<ShiftRegisterScreen> createState() => _ShiftRegisterScreenState();
}

class _ShiftRegisterScreenState extends State<ShiftRegisterScreen> {
  final ScheduleService _service = ScheduleService();

  late DateTime _selected;
  late DateTime _monday;

  List<ShiftTemplate> _templates = const [];
  List<ScheduledShift> _existing = const [];
  bool _loadingTemplates = true;
  bool _loadingWeek = true;
  String? _error;
  bool _busy = false;
  List<String> _errors = const [];
  int _weekToken = 0;

  /// Các ca đã chọn, giữ nguyên khi chuyển ngày/tuần.
  final Map<String, _Pick> _picks = {};

  @override
  void initState() {
    super.initState();
    final now = dateOnly(DateTime.now());
    final tomorrow = DateTime(now.year, now.month, now.day + 1);
    _selected = tomorrow;
    _monday = _mondayOf(tomorrow);
    _loadTemplates();
    _loadWeek();
  }

  String _key(DateTime d, String shiftId) => '${toSqlDate(d)}|$shiftId';

  Future<void> _loadTemplates() async {
    setState(() {
      _loadingTemplates = true;
      _error = null;
    });
    try {
      final t = await _service.templates();
      if (!mounted) return;
      setState(() {
        _templates = t;
        _loadingTemplates = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingTemplates = false;
      });
    }
  }

  Future<void> _loadWeek() async {
    final token = ++_weekToken;
    setState(() {
      _loadingWeek = true;
      _error = null;
    });
    try {
      final list = await _service.week(_monday);
      if (!mounted || token != _weekToken) return;
      setState(() {
        _existing = list;
        _loadingWeek = false;
      });
    } catch (e) {
      if (!mounted || token != _weekToken) return;
      setState(() {
        _error = e.toString();
        _loadingWeek = false;
      });
    }
  }

  void _reloadAll() {
    _loadTemplates();
    _loadWeek();
  }

  bool get _canGoPrev => _monday.isAfter(_mondayOf(DateTime.now()));

  void _moveWeek(int delta) {
    final next = DateTime(_monday.year, _monday.month, _monday.day + 7 * delta);
    if (delta < 0 && !_canGoPrev) return;
    final now = dateOnly(DateTime.now());
    final tomorrow = DateTime(now.year, now.month, now.day + 1);
    setState(() {
      _monday = next;
      _selected = next.isBefore(tomorrow) ? tomorrow : next;
    });
    _loadWeek();
  }

  List<DateTime> get _days => List.generate(7, (i) => DateTime(_monday.year, _monday.month, _monday.day + i));

  bool _isPast(DateTime d) => !dateOnly(d).isAfter(dateOnly(DateTime.now())); // hôm nay và quá khứ không đăng ký được

  // ---------- Quy tắc từng ca ----------

  ScheduledShift? _sameShiftExisting(DateTime day, ShiftTemplate t) {
    for (final e in _existing) {
      if (sameDay(e.workDate, day) &&
          e.name == t.name &&
          e.start == t.start &&
          e.end == t.end &&
          e.status != 'CANCELLED') {
        return e;
      }
    }
    return null;
  }

  ScheduledShift? _overlapExisting(DateTime day, ShiftTemplate t) {
    for (final e in _existing) {
      final active = (e.isRegistration && e.status == 'PENDING') || countsAsWorkShift(e);
      if (active && sameDay(e.workDate, day) && shiftsOverlap(e.start, e.end, t.start, t.end)) return e;
    }
    return null;
  }

  _Pick? _overlapPicked(DateTime day, ShiftTemplate t) {
    for (final p in _picks.values) {
      if (sameDay(p.date, day) && p.t.id != t.id && shiftsOverlap(p.t.start, p.t.end, t.start, t.end)) return p;
    }
    return null;
  }

  void _toggle(DateTime day, ShiftTemplate t) {
    final k = _key(day, t.id);
    setState(() {
      if (_picks.containsKey(k)) {
        _picks.remove(k);
      } else {
        _picks[k] = (date: day, t: t);
      }
      _errors = const [];
    });
  }

  List<_Pick> get _sortedPicks {
    final l = _picks.values.toList();
    l.sort((a, b) {
      final c = a.date.compareTo(b.date);
      return c != 0 ? c : a.t.start.compareTo(b.t.start);
    });
    return l;
  }

  int get _totalMinutes => _picks.values.fold(0, (s, p) => s + shiftMinutes(p.t.start, p.t.end));

  // ---------- Gửi đăng ký ----------

  Widget _summaryList(List<_Pick> picks) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final p in picks)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline_rounded, size: 16, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${weekdayShort(p.date)} ${formatDayMonth(p.date)} • ${p.t.name} (${p.t.start} - ${p.t.end})',
                    style: AppText.body,
                  ),
                ),
              ],
            ),
          ),
        const Divider(height: 20),
        Text('Tổng: ${picks.length} ca • ${formatMinutes(_totalMinutes)}',
            style: AppText.title.copyWith(color: AppColors.primary)),
      ],
    );
  }

  Future<void> _submit() async {
    if (_busy || _picks.isEmpty) return;
    final picks = _sortedPicks;

    final ok = await showConfirmDialog(
      context,
      title: 'Xác nhận đăng ký ca',
      content: SingleChildScrollView(child: _summaryList(picks)),
      confirmLabel: 'Gửi đăng ký',
    );
    if (!ok || !mounted || _busy) return;

    setState(() {
      _busy = true;
      _errors = const [];
    });

    List<RegisterOutcome> outcomes = const [];
    String? fatal;
    try {
      outcomes = await _service.registerMany(
        picks.map((p) => (shiftId: p.t.id, date: p.date)).toList(),
      );
    } catch (e) {
      fatal = e.toString();
    }
    if (!mounted) return;

    final failed = <String>[];
    for (final o in outcomes) {
      if (o.ok) {
        _picks.remove(_key(o.date, o.shiftId));
      } else {
        final name = _templates.where((t) => t.id == o.shiftId).map((t) => t.name).firstOrNull ?? 'Ca làm';
        failed.add('$name ${formatDayMonth(o.date)}: ${o.error}');
      }
    }
    if (fatal != null) failed.add(fatal);

    setState(() {
      _busy = false;
      _errors = failed;
    });

    if (_picks.isEmpty && failed.isEmpty) {
      Navigator.pop(context, true);
      return;
    }
    // Có lỗi hoặc chỉ thành công một phần: giữ lại các ca chưa gửi được và làm mới dữ liệu.
    final okCount = outcomes.where((o) => o.ok).length;
    if (okCount > 0) {
      showAppSnack(context, 'Đã gửi $okCount ca. ${failed.length} ca chưa gửi được.');
    } else {
      showAppSnack(context, 'Chưa gửi được đăng ký. Xem chi tiết bên dưới.', error: true);
    }
    _loadWeek();
  }

  Future<void> _confirmLeave() async {
    final ok = await showConfirmDialog(
      context,
      title: 'Bỏ các ca đã chọn?',
      content: const Text('Bạn chưa gửi đăng ký. Thoát bây giờ sẽ mất các ca đang chọn.', style: AppText.body),
      confirmLabel: 'Thoát',
      danger: true,
    );
    if (ok && mounted) Navigator.pop(context, false);
  }

  // ---------- Giao diện ----------

  @override
  Widget build(BuildContext context) {
    final loading = _loadingTemplates || _loadingWeek;
    return PopScope(
      canPop: _picks.isEmpty || _busy,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: AppPage(
        title: 'Đăng ký ca làm',
        subtitle: 'Chọn các ca bạn muốn làm',
        child: Column(
          children: [
            _weekSwitcher(),
            const SizedBox(height: 4),
            DayStrip(
              days: _days,
              selected: _selected,
              marks: _marks(),
              isDisabled: _isPast,
              onSelect: (d) => setState(() => _selected = d),
            ),
            const SizedBox(height: 4),
            Expanded(
              child: AsyncBody(
                loading: loading,
                error: _error,
                onRetry: _reloadAll,
                builder: (_) => _list(),
              ),
            ),
            _bottomBar(),
          ],
        ),
      ),
    );
  }

  Map<DateTime, DayMark> _marks() {
    final m = <DateTime, DayMark>{};
    for (final d in _days) {
      if (_picks.values.any((p) => sameDay(p.date, d))) {
        m[d] = const DayMark(Icons.check_circle_rounded, AppColors.primary, 'đã chọn ca');
      } else if (_existing.any((e) => sameDay(e.workDate, d) && (countsAsWorkShift(e) || (e.isRegistration && e.status == 'PENDING')))) {
        m[d] = const DayMark(Icons.event_available_rounded, AppColors.success, 'đã có ca');
      }
    }
    return m;
  }

  Widget _weekSwitcher() {
    final sunday = DateTime(_monday.year, _monday.month, _monday.day + 6);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            IconButton(
              onPressed: _canGoPrev ? () => _moveWeek(-1) : null,
              icon: const Icon(Icons.chevron_left_rounded),
              tooltip: 'Tuần trước',
            ),
            Expanded(
              child: Text(
                '${formatDayMonth(_monday)} - ${formatDayMonth(sunday)}/${sunday.year}',
                textAlign: TextAlign.center,
                style: AppText.title,
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

  Widget _list() {
    if (_isPast(_selected)) {
      return const EmptyState(
        icon: Icons.lock_clock_outlined,
        title: 'Không đăng ký được ngày này',
        message: 'Chỉ đăng ký được các ca từ ngày mai trở đi.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      children: [
        if (_errors.isNotEmpty) ...[
          InfoBanner(
            tone: PillTone.danger,
            icon: Icons.error_outline_rounded,
            text: _errors.join('\n'),
          ),
          const SizedBox(height: 12),
        ],
        SectionTitle('${weekdayName(_selected)}, ${formatDayMonth(_selected)}'),
        if (_templates.isEmpty)
          const AppCard(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: Text('Chưa có ca nào để đăng ký.', style: AppText.bodyMuted)),
            ),
          )
        else
          ..._templates.map(_templateCard),
        if (_picks.isNotEmpty) ...[
          const SizedBox(height: 8),
          _selectedOverview(),
        ],
      ],
    );
  }

  Widget _templateCard(ShiftTemplate t) {
    final day = _selected;
    final key = _key(day, t.id);
    final selected = _picks.containsKey(key);

    final same = _sameShiftExisting(day, t);
    if (same != null) {
      final info = shiftStatusInfo(same);
      return ShiftCard(
        name: t.name,
        start: t.start,
        end: t.end,
        selectable: true,
        disabled: true,
        badge: StatusPill(info.label, tone: info.tone, icon: info.icon),
        note: same.isRegistration ? 'Bạn đã đăng ký ca này.' : 'Bạn đã được phân ca này.',
      );
    }

    final clash = _overlapExisting(day, t);
    if (clash != null && !selected) {
      return ShiftCard(
        name: t.name,
        start: t.start,
        end: t.end,
        selectable: true,
        disabled: true,
        badge: const StatusPill('Trùng giờ', tone: PillTone.neutral, icon: Icons.block_rounded),
        note: 'Trùng với ca ${clash.name} (${clash.start} - ${clash.end}) đã có trong ngày.',
      );
    }

    final clashPick = _overlapPicked(day, t);
    if (clashPick != null && !selected) {
      return ShiftCard(
        name: t.name,
        start: t.start,
        end: t.end,
        selectable: true,
        disabled: true,
        badge: const StatusPill('Trùng giờ', tone: PillTone.neutral, icon: Icons.block_rounded),
        note: 'Trùng với ca ${clashPick.t.name} bạn đang chọn. Bỏ chọn ca đó để chọn ca này.',
      );
    }

    return ShiftCard(
      name: t.name,
      start: t.start,
      end: t.end,
      selectable: true,
      selected: selected,
      disabled: _busy,
      onTap: () => _toggle(day, t),
      badge: selected
          ? const StatusPill('Đã chọn', tone: PillTone.info, icon: Icons.check_rounded)
          : const StatusPill('Còn nhận', tone: PillTone.success),
    );
  }

  Widget _selectedOverview() {
    final picks = _sortedPicks;
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.playlist_add_check_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              const Expanded(child: Text('Ca đã chọn', style: AppText.title)),
              TextButton(
                onPressed: _busy ? null : () => setState(() => _picks.clear()),
                child: const Text('Bỏ hết'),
              ),
            ],
          ),
          for (final p in picks)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${weekdayShort(p.date)} ${formatDayMonth(p.date)} • ${p.t.name} (${p.t.start} - ${p.t.end})',
                      style: AppText.body,
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: _busy ? null : () => _toggle(p.date, p.t),
                    icon: const Icon(Icons.close_rounded, size: 18),
                    tooltip: 'Bỏ chọn',
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _bottomBar() {
    final n = _picks.length;
    return BottomActionBar(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (n > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Text('Đã chọn $n ca', style: AppText.title),
                  const Spacer(),
                  Text(formatMinutes(_totalMinutes),
                      style: AppText.title.copyWith(color: AppColors.primary)),
                ],
              ),
            ),
          PrimaryButton(
            label: n == 0 ? 'Chọn ít nhất một ca' : 'Xác nhận đăng ký',
            icon: n == 0 ? null : Icons.check_rounded,
            busy: _busy,
            onPressed: n == 0 ? null : _submit,
          ),
        ],
      ),
    );
  }
}
