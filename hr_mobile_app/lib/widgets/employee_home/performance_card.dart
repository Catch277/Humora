import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/models/attendance_record.dart';
import '../../data/models/payslip.dart';
import '../../data/services/attendance_service.dart';
import '../../data/services/payroll_service.dart';
import '../../features/payroll/payroll_gate.dart';
import '../../routes/app_routers.dart';

/// Thẻ "tháng này": số liệu công thật + thu nhập tạm tính (che mặc định, cần mật khẩu để hiện).
class PerformanceCard extends StatefulWidget {
  const PerformanceCard({super.key, this.refreshTick = 0});

  /// Tăng giá trị này để buộc thẻ tải lại (kéo-để-làm-mới ở trang chủ).
  final int refreshTick;

  @override
  State<PerformanceCard> createState() => _PerformanceCardState();
}

class _PerformanceCardState extends State<PerformanceCard> {
  final AttendanceService _attendance = AttendanceService();
  final PayrollService _payroll = PayrollService();

  bool _loading = true;
  String? _error;
  List<AttendanceRecord> _rows = const [];
  PayEstimate? _estimate;
  bool _revealed = false;

  @override
  void initState() {
    super.initState();
    _revealed = PayrollGate.isUnlocked;
    _load();
  }

  @override
  void didUpdateWidget(covariant PerformanceCard old) {
    super.didUpdateWidget(old);
    if (old.refreshTick != widget.refreshTick) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await _attendance.month(DateTime.now());
      PayEstimate? est;
      try {
        est = await _payroll.myEstimate();
      } catch (_) {
        est = null; // Chưa cài chức năng lương: vẫn hiện số liệu công.
      }
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _estimate = est;
        _loading = false;
        _revealed = _revealed && PayrollGate.isUnlocked;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _toggle() async {
    if (_revealed) {
      setState(() => _revealed = false);
      return;
    }
    final ok = await PayrollGate.ensureUnlocked(context);
    if (ok && mounted) setState(() => _revealed = true);
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final last = DateTime(now.year, now.month + 1, 0).day;
    final done = _rows.where((r) => r.checkOutAt != null).toList();
    final minutes = done.fold<int>(0, (s, r) => s + r.workedMinutes);
    final late = _rows.where((r) => r.status == 'LATE').length;
    final early = _rows.where((r) => r.status == 'EARLY_LEAVE').length;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Tháng ${now.month}/${now.year}', style: AppText.h2)),
                StatusPill('Kỳ công 01 - $last/${_two(now.month)}', tone: PillTone.info),
              ],
            ),
            const SizedBox(height: 14),
            if (_loading)
              const SizedBox(height: 70, child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)))
            else if (_error != null)
              Row(
                children: [
                  Expanded(child: Text(_error!, style: AppText.bodyMuted)),
                  TextButton(onPressed: _load, child: const Text('Thử lại')),
                ],
              )
            else
              Row(
                children: [
                  Expanded(child: _stat('Số ca', '${done.length}', 'ca')),
                  const SizedBox(width: 8),
                  Expanded(child: _stat('Giờ làm', formatMinutes(minutes), '')),
                  const SizedBox(width: 8),
                  Expanded(child: _stat('Muộn / Sớm', '$late / $early', 'lần')),
                ],
              ),
            const SizedBox(height: 14),
            _incomeStrip(),
          ],
        ),
      ),
    );
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  Widget _stat(String title, String value, String unit) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppText.caption),
          const SizedBox(height: 6),
          Text(
            unit.isEmpty ? value : '$value $unit',
            style: AppText.title.copyWith(fontSize: 14.5),
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  Widget _incomeStrip() {
    final est = _estimate;
    String amount;
    if (est == null) {
      amount = '—';
    } else if (!est.hasPayProfile) {
      amount = 'Chưa có mức lương';
    } else {
      amount = _revealed ? formatVnd(est.grossEstimate) : maskedMoney;
    }

    return InkWell(
      onTap: () => Navigator.pushNamed(context, AppRoutes.payslips),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.ink, AppColors.inkSoft]),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.account_balance_wallet_outlined, color: Color(0xFFF5B942), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Thu nhập tạm tính', style: TextStyle(color: Colors.white70, fontSize: 11.5)),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          amount,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      if (est != null && est.hasPayProfile) ...[
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: _toggle,
                          child: Icon(
                            _revealed ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                            color: Colors.white60,
                            size: 19,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Colors.white70),
          ],
        ),
      ),
    );
  }
}
