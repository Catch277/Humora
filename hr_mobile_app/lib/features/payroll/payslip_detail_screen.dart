import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/models/payslip.dart';
import '../../data/services/payroll_service.dart';

class PayslipDetailScreen extends StatefulWidget {
  const PayslipDetailScreen({super.key, required this.payslipId});

  final String payslipId;

  @override
  State<PayslipDetailScreen> createState() => _PayslipDetailScreenState();
}

class _PayslipDetailScreenState extends State<PayslipDetailScreen> {
  final PayrollService _service = PayrollService();

  bool _loading = true;
  bool _busy = false;
  bool _showLines = false;
  String? _error;
  Payslip? _slip;

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
      final slip = await _service.getMine(widget.payslipId);
      if (!mounted) return;
      setState(() {
        _slip = slip;
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

  Future<void> _acknowledge() async {
    setState(() => _busy = true);
    try {
      await _service.acknowledge(widget.payslipId);
      if (!mounted) return;
      showAppSnack(context, 'Đã xác nhận phiếu lương. Cảm ơn bạn!');
      await _load();
    } catch (e) {
      if (mounted) showAppSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openDispute() async {
    final note = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _DisputeSheet(),
    );
    if (note == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await _service.dispute(widget.payslipId, note);
      if (!mounted) return;
      showAppSnack(context, 'Đã gửi thắc mắc tới quản lý.');
      await _load();
    } catch (e) {
      if (mounted) showAppSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final slip = _slip;
    return AppPage(
      title: slip == null ? 'Phiếu lương' : 'Phiếu lương T${formatMonthYear(slip.periodStart)}',
      subtitle: slip == null
          ? null
          : 'Kỳ ${formatDayMonth(slip.periodStart)} - ${formatDate(slip.periodEnd)}',
      onRefresh: _load,
      child: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        builder: (context) => slip == null ? const SizedBox.shrink() : _buildBody(slip),
      ),
    );
  }

  Widget _buildBody(Payslip s) {
    final regularLines = s.workLines.where((l) => !l.isOvertime).toList();
    final overtimeLines = s.workLines.where((l) => l.isOvertime).toList();
    final regularAmount = regularLines.fold<int>(0, (sum, l) => sum + l.amount);
    final overtimeAmount = overtimeLines.fold<int>(0, (sum, l) => sum + l.amount);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        _buildHero(s),
        const SizedBox(height: 16),
        if (s.hasOpenDispute)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: InfoBanner(
              tone: PillTone.warning,
              icon: Icons.hourglass_top_rounded,
              text: 'Thắc mắc của bạn đang chờ quản lý phản hồi: “${s.disputeNote ?? ''}”',
            ),
          )
        else if (s.hadDispute)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: InfoBanner(
              tone: PillTone.success,
              icon: Icons.check_circle_outline_rounded,
              text: 'Thắc mắc trước đó của bạn đã được quản lý xử lý.',
            ),
          ),
        const SectionTitle('Thu nhập'),
        AppCard(
          child: Column(
            children: [
              _row(
                'Giờ làm thường',
                formatVnd(regularLines.isEmpty ? s.workAmount - overtimeAmount : regularAmount),
                sub: formatMinutes(s.regularMinutes),
              ),
              if (s.overtimeMinutes > 0)
                _row(
                  'Tăng ca',
                  formatVnd(overtimeAmount),
                  sub: '${formatMinutes(s.overtimeMinutes)} • hệ số ${_mult(overtimeLines)}',
                ),
              ...s.earnings.map((i) => _row(i.label, formatVnd(i.amount))),
              const Divider(height: 22, color: AppColors.border),
              _row('Tổng thu nhập', formatVnd(s.grossAmount), bold: true),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const SectionTitle('Khấu trừ'),
        AppCard(
          child: Column(
            children: [
              if (s.deductions.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 4),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Không có khoản khấu trừ', style: AppText.bodyMuted),
                  ),
                )
              else
                ...s.deductions.map((i) => _row(i.label, '- ${formatVnd(i.amount)}', negative: true)),
              const Divider(height: 22, color: AppColors.border),
              _row('Tổng khấu trừ', s.deductionAmount == 0 ? formatVnd(0) : '- ${formatVnd(s.deductionAmount)}',
                  bold: true, negative: s.deductionAmount > 0),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _buildWorkLines(s),
        if (s.shiftsSkipped > 0) ...[
          const SizedBox(height: 12),
          InfoBanner(
            tone: PillTone.warning,
            icon: Icons.warning_amber_rounded,
            text:
                '${s.shiftsSkipped} ca trong kỳ chưa được tính tiền. Nếu bạn thấy thiếu, hãy gửi thắc mắc kèm ngày cụ thể.',
          ),
        ],
        const SizedBox(height: 20),
        if (!s.isAcknowledged)
          PrimaryButton(
            label: 'Xác nhận đã xem phiếu lương',
            icon: Icons.check_rounded,
            busy: _busy,
            onPressed: _acknowledge,
          )
        else
          Center(
            child: StatusPill(
              'Bạn đã xác nhận lúc ${formatDate(s.acknowledgedAt!)} ${formatTime(s.acknowledgedAt!)}',
              tone: PillTone.success,
              icon: Icons.check_circle_outline_rounded,
            ),
          ),
        if (!s.hasOpenDispute) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _openDispute,
              icon: const Icon(Icons.flag_outlined, size: 18),
              label: Text(s.hadDispute ? 'Gửi thắc mắc mới' : 'Có sai sót? Gửi thắc mắc'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textPrimary,
                side: const BorderSide(color: AppColors.border),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Phiếu lương được tính từ giờ làm thực tế trong Bảng công. '
            'Thông tin này chỉ mình bạn và chủ sở hữu có quyền xem.',
            style: AppText.caption,
          ),
        ),
      ],
    );
  }

  String _mult(List<PayslipWorkLine> lines) {
    if (lines.isEmpty) return '1';
    final m = lines.first.multiplier;
    return m == m.roundToDouble() ? m.toStringAsFixed(0) : m.toString();
  }

  Widget _buildHero(Payslip s) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryStrong],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('THỰC NHẬN', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: 8),
          Text(
            formatVnd(s.netAmount),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.w800,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _heroChip(Icons.event_available_outlined, '${s.shiftsCounted} ca'),
              _heroChip(Icons.schedule_outlined, formatMinutes(s.regularMinutes + s.overtimeMinutes)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroChip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _buildWorkLines(Payslip s) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _showLines = !_showLines),
            borderRadius: BorderRadius.circular(18),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.list_alt_rounded, color: AppColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('Chi tiết ${s.workLines.length} ca đã tính', style: AppText.title),
                  ),
                  Icon(_showLines ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                      color: AppColors.textMuted),
                ],
              ),
            ),
          ),
          if (_showLines)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: s.workLines.map((l) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 54,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(weekdayShort(l.workDate), style: AppText.caption),
                              Text(formatDayMonth(l.workDate),
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(l.shiftName,
                                        style: AppText.body, overflow: TextOverflow.ellipsis),
                                  ),
                                  if (l.isOvertime) ...[
                                    const SizedBox(width: 6),
                                    const StatusPill('Tăng ca', tone: PillTone.info),
                                  ],
                                ],
                              ),
                              Text(formatMinutes(l.minutes), style: AppText.caption),
                            ],
                          ),
                        ),
                        Text(formatVnd(l.amount), style: AppText.money.copyWith(fontSize: 14)),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {String? sub, bool bold = false, bool negative = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: bold ? AppText.title : AppText.body),
                if (sub != null) Text(sub, style: AppText.caption),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            style: AppText.money.copyWith(
              fontSize: bold ? 16 : 14.5,
              color: negative ? AppColors.danger : AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _DisputeSheet extends StatefulWidget {
  const _DisputeSheet();

  @override
  State<_DisputeSheet> createState() => _DisputeSheetState();
}

class _DisputeSheetState extends State<_DisputeSheet> {
  final TextEditingController _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _note.text.trim();
    if (text.length < 5) {
      setState(() => _error = 'Hãy mô tả cụ thể hơn (ít nhất 5 ký tự).');
      return;
    }
    Navigator.pop(context, text);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(24, 14, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4)),
              ),
            ),
            const SizedBox(height: 18),
            const Text('Gửi thắc mắc về phiếu lương', style: AppText.h2),
            const SizedBox(height: 6),
            const Text(
              'Nêu rõ ngày/ca bị thiếu hoặc khoản chưa đúng. Quản lý sẽ nhận được thông báo.',
              style: AppText.bodyMuted,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _note,
              maxLines: 4,
              maxLength: 500,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Ví dụ: Ngày 12/09 tôi làm đủ ca sáng nhưng chưa được tính.',
                errorText: _error,
                filled: true,
                fillColor: AppColors.surfaceMuted,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 12),
            PrimaryButton(label: 'Gửi thắc mắc', icon: Icons.send_rounded, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
