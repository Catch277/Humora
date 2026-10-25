import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/models/attendance_record.dart';
import '../../data/services/attendance_service.dart';

class TimesheetScreen extends StatefulWidget {
  const TimesheetScreen({super.key});

  @override
  State<TimesheetScreen> createState() => _TimesheetScreenState();
}

class _TimesheetScreenState extends State<TimesheetScreen> {
  final AttendanceService _service = AttendanceService();
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month, 1);
  bool _loading = true;
  String? _error;
  List<AttendanceRecord> _rows = const [];

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
      final rows = await _service.month(_month);
      if (!mounted) return;
      setState(() {
        _rows = rows;
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

  void _shift(int delta) {
    final next = DateTime(_month.year, _month.month + delta, 1);
    final now = DateTime.now();
    if (next.isAfter(DateTime(now.year, now.month, 1))) return;
    setState(() => _month = next);
    _load();
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
      showAppSnack(context, 'Đã gửi khiếu nại tới quản lý.');
      _load();
    } catch (e) {
      if (mounted) showAppSnack(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Bảng công',
      subtitle: 'Giờ làm thực tế của bạn',
      onRefresh: _load,
      child: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        builder: (_) => _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    final worked = _rows.where((r) => r.checkOutAt != null).toList();
    final totalMinutes = worked.fold<int>(0, (s, r) => s + r.workedMinutes);
    final late = _rows.where((r) => r.status == 'LATE').length;
    final early = _rows.where((r) => r.status == 'EARLY_LEAVE').length;
    final now = DateTime.now();
    final isCurrent = _month.year == now.year && _month.month == now.month;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              IconButton(onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left_rounded), tooltip: 'Tháng trước'),
              Expanded(
                child: Text(
                  'Tháng ${formatMonthYear(_month)}',
                  textAlign: TextAlign.center,
                  style: AppText.title,
                ),
              ),
              IconButton(
                onPressed: isCurrent ? null : () => _shift(1),
                icon: const Icon(Icons.chevron_right_rounded),
                tooltip: 'Tháng sau',
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _stat('Số ca', '${worked.length}', Icons.event_available_outlined)),
            const SizedBox(width: 10),
            Expanded(child: _stat('Giờ làm', formatMinutes(totalMinutes), Icons.schedule_outlined)),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _stat('Đi muộn', '$late lần', Icons.running_with_errors_outlined)),
            const SizedBox(width: 10),
            Expanded(child: _stat('Về sớm', '$early lần', Icons.logout_rounded)),
          ],
        ),
        const SizedBox(height: 20),
        const SectionTitle('Chi tiết'),
        if (_rows.isEmpty)
          const AppCard(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: Text('Tháng này chưa có dữ liệu chấm công', style: AppText.bodyMuted)),
            ),
          )
        else
          ..._rows.map(_card),
      ],
    );
  }

  Widget _stat(String label, String value, IconData icon) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppText.caption),
                const SizedBox(height: 2),
                Text(value, style: AppText.title, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }

  (String, PillTone) _statusInfo(AttendanceRecord r) {
    switch (r.status) {
      case 'LATE':
        return ('Đi muộn', PillTone.warning);
      case 'EARLY_LEAVE':
        return ('Về sớm', PillTone.warning);
      case 'ABSENT':
        return ('Vắng', PillTone.danger);
      case 'INCOMPLETE':
        return ('Thiếu giờ ra', PillTone.danger);
      default:
        return ('Đúng giờ', PillTone.success);
    }
  }

  Widget _card(AttendanceRecord r) {
    final (label, tone) = _statusInfo(r);
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
              StatusPill(label, tone: tone),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            r.shiftName == null
                ? 'Chưa gắn ca'
                : '${r.shiftName}${r.shiftStart != null ? ' (${r.shiftStart} - ${r.shiftEnd})' : ''}',
            style: AppText.bodyMuted,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _time('Vào', inT),
              const SizedBox(width: 24),
              _time('Ra', outT),
              const SizedBox(width: 24),
              _time('Giờ làm', r.checkOutAt == null ? '--' : formatMinutes(r.workedMinutes)),
            ],
          ),
          if (r.hasOpenComplaint)
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: StatusPill('Khiếu nại đang chờ xử lý', tone: PillTone.warning, icon: Icons.hourglass_top_rounded),
            )
          else ...[
            if (r.hasResolvedComplaint)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: StatusPill('Khiếu nại đã được xử lý', tone: PillTone.success, icon: Icons.check_circle_outline_rounded),
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
            const Text('Khiếu nại bảng công', style: AppText.h2),
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
            PrimaryButton(label: 'Gửi khiếu nại', icon: Icons.send_rounded, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
