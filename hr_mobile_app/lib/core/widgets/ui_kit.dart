import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../app_theme.dart';
import '../../data/models/attendance_record.dart';
import '../format.dart';
import 'app_widgets.dart';

/// Có nên tắt hiệu ứng không (người dùng bật "giảm chuyển động" trên hệ điều hành).
bool reduceMotion(BuildContext context) => MediaQuery.of(context).disableAnimations;

// ───────────────────────── Nút phụ ─────────────────────────

/// Nút phụ: viền xanh, nền trắng. Cùng chiều cao với [PrimaryButton].
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: expand ? double.infinity : null,
      height: 50,
      child: OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: BorderSide(color: onPressed == null || busy ? AppColors.border : AppColors.primary),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
        child: busy
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                ],
              ),
      ),
    );
  }
}

// ───────────────────────── Thẻ chỉ số ─────────────────────────

/// Thẻ chỉ số tổng quan: biểu tượng + nhãn + giá trị.
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color = AppColors.primary,
    this.background = AppColors.primarySoft,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppText.h2.copyWith(fontSize: 17)),
          ),
          const SizedBox(height: 2),
          Text(label, style: AppText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ───────────────────────── Hộp thoại xác nhận ─────────────────────────

/// Hộp thoại xác nhận. Trả về true nếu người dùng đồng ý.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required Widget content,
  String confirmLabel = 'Xác nhận',
  String cancelLabel = 'Huỷ',
  bool danger = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(title, style: AppText.h2),
      content: content,
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text(cancelLabel, style: const TextStyle(color: AppColors.textSecondary)),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(
            backgroundColor: danger ? AppColors.danger : AppColors.primary,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok == true;
}

// ───────────────────────── Dãy ngày cuộn ngang ─────────────────────────

/// Một dấu trạng thái nhỏ dưới ngày. Luôn có icon + nhãn chữ để không chỉ dựa vào màu.
class DayMark {
  const DayMark(this.icon, this.color, this.label);
  final IconData icon;
  final Color color;
  final String label;
}

const DayMark kMarkOnTime = DayMark(Icons.check_circle_rounded, AppColors.success, 'đúng giờ');
const DayMark kMarkLateEarly = DayMark(Icons.schedule_rounded, AppColors.warning, 'đi trễ / về sớm');
const DayMark kMarkAbsent = DayMark(Icons.error_rounded, AppColors.danger, 'vắng / thiếu giờ ra');
const DayMark kMarkScheduled = DayMark(Icons.radio_button_unchecked_rounded, AppColors.primary, 'có ca, chưa có công');

/// Dấu trạng thái của một ngày dựa trên các bản ghi chấm công của ngày đó (xấu nhất thắng).
DayMark markForRecords(List<AttendanceRecord> list) {
  if (list.any((r) => r.status == 'ABSENT' || r.status == 'INCOMPLETE')) return kMarkAbsent;
  if (list.any((r) => r.status == 'LATE' || r.status == 'EARLY_LEAVE')) return kMarkLateEarly;
  return kMarkOnTime;
}

/// Dãy ngày cuộn ngang. Ngày được chọn có nền xanh. [marks] cho biết trạng thái từng ngày.
class DayStrip extends StatefulWidget {
  const DayStrip({
    super.key,
    required this.days,
    required this.selected,
    required this.onSelect,
    this.marks = const {},
    this.isDisabled,
  });

  final List<DateTime> days;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;
  final Map<DateTime, DayMark> marks;
  final bool Function(DateTime day)? isDisabled;

  @override
  State<DayStrip> createState() => _DayStripState();
}

class _DayStripState extends State<DayStrip> {
  static const double _itemW = 54;
  static const double _gap = 8;
  final ScrollController _ctrl = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reveal(animate: false));
  }

  @override
  void didUpdateWidget(covariant DayStrip old) {
    super.didUpdateWidget(old);
    if (!sameDay(old.selected, widget.selected) || old.days.first != widget.days.first) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reveal());
    }
  }

  void _reveal({bool animate = true}) {
    if (!_ctrl.hasClients) return;
    final i = widget.days.indexWhere((d) => sameDay(d, widget.selected));
    if (i < 0) return;
    final target = (i * (_itemW + _gap) - (_ctrl.position.viewportDimension - _itemW) / 2)
        .clamp(0.0, _ctrl.position.maxScrollExtent);
    if (animate && !reduceMotion(context)) {
      _ctrl.animateTo(target, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    } else {
      _ctrl.jumpTo(target);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final today = dateOnly(DateTime.now());
    return SizedBox(
      height: 80,
      child: ListView.separated(
        controller: _ctrl,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: widget.days.length,
        separatorBuilder: (_, __) => const SizedBox(width: _gap),
        itemBuilder: (_, i) {
          final d = widget.days[i];
          final sel = sameDay(d, widget.selected);
          final disabled = widget.isDisabled?.call(d) ?? false;
          final isToday = sameDay(d, today);
          final mark = widget.marks[dateOnly(d)];
          final fg = sel ? Colors.white : (disabled ? AppColors.textMuted : AppColors.textPrimary);
          return Semantics(
            button: true,
            selected: sel,
            enabled: !disabled,
            label: '${weekdayName(d)} ${formatDayMonth(d)}${isToday ? ', hôm nay' : ''}${mark != null ? ', ${mark.label}' : ''}',
            child: GestureDetector(
              onTap: disabled ? null : () => widget.onSelect(d),
              child: AnimatedContainer(
                duration: reduceMotion(context) ? Duration.zero : const Duration(milliseconds: 180),
                width: _itemW,
                decoration: BoxDecoration(
                  color: sel ? AppColors.primary : (disabled ? AppColors.surfaceMuted : AppColors.surface),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: sel ? AppColors.primary : (isToday ? AppColors.primary : AppColors.border),
                    width: isToday && !sel ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekdayShort(d),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: sel ? Colors.white70 : AppColors.textMuted),
                    ),
                    const SizedBox(height: 2),
                    Text('${d.day}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: fg)),
                    const SizedBox(height: 4),
                    SizedBox(
                      height: 12,
                      child: mark == null
                          ? null
                          : Icon(mark.icon, size: 12, color: sel ? Colors.white : mark.color),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ───────────────────────── Lịch tháng ─────────────────────────

/// Lịch tháng: hàng đầu là thứ (T2…CN), ngày đặt đúng cột thứ. Chạm vào ngày để chọn.
class MonthCalendar extends StatelessWidget {
  const MonthCalendar({
    super.key,
    required this.month,
    required this.selected,
    required this.onSelect,
    this.marks = const {},
  });

  final DateTime month; // ngày bất kỳ trong tháng
  final DateTime? selected;
  final ValueChanged<DateTime> onSelect;
  final Map<DateTime, DayMark> marks;

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final lead = first.weekday - 1; // số ô trống trước ngày 1 (thứ Hai = 0)
    final cells = lead + daysInMonth;
    final rows = (cells / 7).ceil();
    final today = dateOnly(DateTime.now());

    return AppCard(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 8),
      child: Column(
        children: [
          Row(
            children: [
              for (final w in const ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
                Expanded(
                  child: Center(
                    child: Text(w, style: AppText.caption.copyWith(fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          for (var r = 0; r < rows; r++)
            Row(
              children: [
                for (var c = 0; c < 7; c++)
                  Expanded(child: _cell(r * 7 + c - lead + 1, daysInMonth, today)),
              ],
            ),
        ],
      ),
    );
  }

  Widget _cell(int dayNum, int daysInMonth, DateTime today) {
    if (dayNum < 1 || dayNum > daysInMonth) return const SizedBox(height: 46);
    final d = DateTime(month.year, month.month, dayNum);
    final sel = selected != null && sameDay(d, selected!);
    final isToday = sameDay(d, today);
    final mark = marks[d];
    return Semantics(
      button: true,
      selected: sel,
      label: '${weekdayName(d)} ${formatDayMonth(d)}${isToday ? ', hôm nay' : ''}${mark != null ? ', ${mark.label}' : ', không có dữ liệu'}',
      child: InkWell(
        onTap: () => onSelect(d),
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 46,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              width: 38,
              height: 42,
              decoration: BoxDecoration(
                color: sel ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                border: isToday && !sel ? Border.all(color: AppColors.primary, width: 1.5) : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$dayNum',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: sel || isToday ? FontWeight.w800 : FontWeight.w600,
                      color: sel ? Colors.white : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  SizedBox(
                    height: 11,
                    child: mark == null ? null : Icon(mark.icon, size: 11, color: sel ? Colors.white : mark.color),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Chú giải màu + icon của lịch.
class CalendarLegend extends StatelessWidget {
  const CalendarLegend({super.key, required this.items});
  final List<DayMark> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final m in items)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(m.icon, size: 13, color: m.color),
              const SizedBox(width: 4),
              Text(m.label, style: AppText.caption),
            ],
          ),
      ],
    );
  }
}

// ───────────────────────── Thẻ ca làm ─────────────────────────

/// Thẻ một ca làm: tên ca, giờ, thời lượng, trạng thái. Có thể kèm checkbox (đăng ký ca) hoặc hành động.
class ShiftCard extends StatelessWidget {
  const ShiftCard({
    super.key,
    required this.name,
    required this.start,
    required this.end,
    this.badge,
    this.note,
    this.footer,
    this.selectable = false,
    this.selected = false,
    this.disabled = false,
    this.onTap,
  });

  final String name;
  final String start;
  final String end;
  final Widget? badge;

  /// Dòng ghi chú nhỏ (ví dụ lý do không chọn được).
  final String? note;
  final Widget? footer;

  /// Hiện checkbox ở đầu thẻ.
  final bool selectable;
  final bool selected;
  final bool disabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final mins = shiftMinutes(start, end);
    final borderColor = selected ? AppColors.primary : AppColors.border;
    return Semantics(
      checked: selectable ? selected : null,
      enabled: !disabled,
      label: '$name, $start đến $end, ${formatMinutes(mins)}${note != null ? ', $note' : ''}',
      child: AnimatedContainer(
        duration: reduceMotion(context) ? Duration.zero : const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: disabled
              ? AppColors.surfaceMuted
              : (selected ? AppColors.primarySoft : AppColors.surface),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: borderColor, width: selected ? 1.6 : 1),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: disabled ? null : onTap,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (selectable) ...[
                        _Check(checked: selected, disabled: disabled),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: AppText.title.copyWith(color: disabled ? AppColors.textMuted : AppColors.textPrimary),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Icon(Icons.schedule_rounded, size: 15, color: disabled ? AppColors.textMuted : AppColors.primary),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    '$start - $end  •  ${formatMinutes(mins)}',
                                    style: AppText.bodyMuted,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (badge != null) ...[const SizedBox(width: 8), badge!],
                    ],
                  ),
                  if (note != null) ...[
                    const SizedBox(height: 8),
                    Text(note!, style: AppText.caption.copyWith(color: AppColors.textSecondary)),
                  ],
                  if (footer != null) ...[const SizedBox(height: 10), footer!],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.checked, required this.disabled});
  final bool checked;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: reduceMotion(context) ? Duration.zero : const Duration(milliseconds: 140),
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: checked ? AppColors.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(
          color: checked ? AppColors.primary : (disabled ? AppColors.border : AppColors.textMuted),
          width: 1.6,
        ),
      ),
      child: AnimatedScale(
        scale: checked ? 1 : 0,
        duration: reduceMotion(context) ? Duration.zero : const Duration(milliseconds: 140),
        child: const Icon(Icons.check_rounded, size: 16, color: Colors.white),
      ),
    );
  }
}

// ───────────────────────── Nhãn lọc ─────────────────────────

/// Hàng chip lọc cuộn ngang. [counts] (tuỳ chọn) hiện số lượng cạnh nhãn.
class FilterChipsRow<T> extends StatelessWidget {
  const FilterChipsRow({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.counts = const {},
  });

  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;
  final Map<T, int> counts;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final e in options.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(counts.containsKey(e.key) ? '${e.value} (${counts[e.key]})' : e.value),
                selected: e.key == value,
                onSelected: (_) => onChanged(e.key),
                showCheckmark: false,
                labelStyle: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: e.key == value ? Colors.white : AppColors.textSecondary,
                ),
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.surface,
                side: BorderSide(color: e.key == value ? AppColors.primary : AppColors.border),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              ),
            ),
        ],
      ),
    );
  }
}

// ───────────────────────── Chọn tháng/năm ─────────────────────────

/// Bảng chọn tháng/năm. Trả về ngày mùng 1 của tháng đã chọn. Không cho chọn tháng sau [maxMonth].
Future<DateTime?> showMonthYearPicker(
  BuildContext context, {
  required DateTime initial,
  required DateTime maxMonth,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => _MonthYearSheet(initial: initial, maxMonth: maxMonth),
  );
}

class _MonthYearSheet extends StatefulWidget {
  const _MonthYearSheet({required this.initial, required this.maxMonth});
  final DateTime initial;
  final DateTime maxMonth;

  @override
  State<_MonthYearSheet> createState() => _MonthYearSheetState();
}

class _MonthYearSheetState extends State<_MonthYearSheet> {
  late int _year = widget.initial.year;

  @override
  Widget build(BuildContext context) {
    final max = widget.maxMonth;
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () => setState(() => _year--),
                  icon: const Icon(Icons.chevron_left_rounded),
                  tooltip: 'Năm trước',
                ),
                Expanded(child: Center(child: Text('$_year', style: AppText.h2))),
                IconButton(
                  onPressed: _year >= max.year ? null : () => setState(() => _year++),
                  icon: const Icon(Icons.chevron_right_rounded),
                  tooltip: 'Năm sau',
                ),
              ],
            ),
            const SizedBox(height: 8),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.9,
              children: [
                for (var m = 1; m <= 12; m++)
                  _monthTile(m, enabled: DateTime(_year, m, 1).compareTo(DateTime(max.year, max.month, 1)) <= 0),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _monthTile(int m, {required bool enabled}) {
    final sel = _year == widget.initial.year && m == widget.initial.month;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: enabled ? () => Navigator.pop(context, DateTime(_year, m, 1)) : null,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: sel ? AppColors.primary : (enabled ? AppColors.surfaceMuted : Colors.transparent),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'Tháng $m',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: sel ? Colors.white : (enabled ? AppColors.textPrimary : AppColors.border),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── Thanh thao tác cố định ─────────────────────────

/// Khu thao tác cố định phía dưới nội dung (đặt trong Column, dưới phần Expanded, nên không che nội dung).
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: child,
    );
  }
}
