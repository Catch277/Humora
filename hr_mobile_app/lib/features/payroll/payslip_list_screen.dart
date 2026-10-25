import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/models/payslip.dart';
import '../../data/services/payroll_service.dart';
import 'payroll_gate.dart';
import 'payslip_detail_screen.dart';

class PayslipListScreen extends StatefulWidget {
  const PayslipListScreen({super.key});

  @override
  State<PayslipListScreen> createState() => _PayslipListScreenState();
}

class _PayslipListScreenState extends State<PayslipListScreen> {
  final PayrollService _service = PayrollService();

  bool _unlocked = PayrollGate.isUnlocked;
  bool _loading = true;
  String? _error;
  String? _estimateError;
  List<Payslip> _slips = const [];
  PayEstimate? _estimate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlockThenLoad());
  }

  Future<void> _unlockThenLoad() async {
    if (!mounted) return;
    final ok = await PayrollGate.ensureUnlocked(context);
    if (!mounted) return;
    setState(() => _unlocked = ok);
    if (ok) await _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _estimateError = null;
    });

    // Hai việc độc lập: lỗi của thu nhập tạm tính không được chặn danh sách phiếu.
    final results = await Future.wait<Object?>([
      _service.listMine().then<Object?>((v) => v).catchError((Object e) => e),
      _service.myEstimate().then<Object?>((v) => v).catchError((Object e) => e),
    ]);
    if (!mounted) return;

    final slips = results[0];
    final estimate = results[1];
    setState(() {
      _loading = false;
      if (slips is List<Payslip>) {
        _slips = slips;
      } else {
        _error = slips.toString();
      }
      if (estimate is PayEstimate) {
        _estimate = estimate;
      } else {
        _estimate = null;
        _estimateError = estimate.toString();
      }
    });
  }

  Future<void> _open(Payslip slip) async {
    if (!await PayrollGate.ensureUnlocked(context)) return;
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => PayslipDetailScreen(payslipId: slip.id)),
    );
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Phiếu lương',
      subtitle: 'Chỉ mình bạn xem được thông tin này',
      onRefresh: _unlocked ? _load : null,
      child: _unlocked
          ? AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              builder: (context) => _buildList(),
            )
          : _buildLocked(),
    );
  }

  Widget _buildLocked() {
    return EmptyState(
      icon: Icons.lock_outline_rounded,
      title: 'Thông tin lương đang được khoá',
      message: 'Nhập lại mật khẩu để xem thu nhập và các phiếu lương của bạn.',
      actionLabel: 'Mở khoá',
      onAction: _unlockThenLoad,
    );
  }

  Widget _buildList() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _buildEstimate(),
        const SizedBox(height: 22),
        const SectionTitle('Phiếu lương đã chốt'),
        if (_slips.isEmpty)
          const AppCard(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Column(
                children: [
                  Icon(Icons.receipt_long_outlined, size: 34, color: AppColors.textMuted),
                  SizedBox(height: 10),
                  Text('Chưa có phiếu lương nào', style: AppText.title),
                  SizedBox(height: 4),
                  Text(
                    'Phiếu lương của tháng sẽ xuất hiện ở đây sau khi quản lý chốt kỳ lương.',
                    textAlign: TextAlign.center,
                    style: AppText.bodyMuted,
                  ),
                ],
              ),
            ),
          )
        else
          ..._slips.map(_buildSlipCard),
      ],
    );
  }

  Widget _buildEstimate() {
    final est = _estimate;
    if (est == null) {
      return AppCard(
        child: Text(
          _estimateError ?? 'Chưa có dữ liệu thu nhập tạm tính.',
          style: AppText.bodyMuted,
        ),
      );
    }

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.ink, AppColors.inkSoft],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.account_balance_wallet_outlined, color: Color(0xFFF5B942), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Thu nhập tạm tính tháng ${formatMonthYear(est.periodStart)}',
                    style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                est.hasPayProfile ? formatVnd(est.grossEstimate) : 'Chưa có mức lương',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: est.hasPayProfile ? 30 : 20,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                est.hasPayProfile
                    ? '${est.shiftsCounted} ca • ${formatMinutes(est.totalMinutes)} • chưa trừ các khoản khấu trừ'
                    : 'Quản lý chưa thiết lập mức lương cho bạn.',
                style: const TextStyle(color: Colors.white60, fontSize: 12.5, height: 1.4),
              ),
            ],
          ),
        ),
        if (est.shiftsSkipped > 0) ...[
          const SizedBox(height: 12),
          InfoBanner(
            tone: PillTone.warning,
            icon: Icons.warning_amber_rounded,
            text:
                '${est.shiftsSkipped} ca trong tháng chưa được tính tiền (chưa có ca phân công hoặc chấm công chưa hợp lệ). '
                'Hãy kiểm tra Bảng công và gửi khiếu nại nếu cần.',
          ),
        ],
        const SizedBox(height: 10),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Số tạm tính có thể thay đổi theo bảng công cuối kỳ. Phiếu lương chính thức chỉ có giá trị sau khi được chốt.',
            style: AppText.caption,
          ),
        ),
      ],
    );
  }

  Widget _buildSlipCard(Payslip s) {
    final PillTone tone;
    final String label;
    final IconData icon;
    if (s.hasOpenDispute) {
      tone = PillTone.warning;
      label = 'Đang chờ phản hồi';
      icon = Icons.hourglass_top_rounded;
    } else if (s.isAcknowledged) {
      tone = PillTone.success;
      label = 'Đã xác nhận';
      icon = Icons.check_circle_outline_rounded;
    } else {
      tone = PillTone.info;
      label = 'Mới';
      icon = Icons.fiber_new_rounded;
    }

    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: () => _open(s),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(
                '${s.periodStart.month}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Tháng ${formatMonthYear(s.periodStart)}', style: AppText.title),
                const SizedBox(height: 4),
                Text(
                  'Thực nhận ${formatVnd(s.netAmount)}',
                  style: AppText.money.copyWith(fontSize: 14, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 8),
                StatusPill(label, tone: tone, icon: icon),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
        ],
      ),
    );
  }
}
