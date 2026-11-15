import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/fx.dart';
import '../../routes/app_routers.dart';

class HrServicesGrid extends StatelessWidget {
  const HrServicesGrid({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    // Mỗi tiện ích có cặp (màu nhấn, nền nhạt) riêng cho Light và Dark để icon/nhãn luôn đủ tương phản.
    Color pick(Color dark, Color light) => p.isDark ? dark : light;
    final items = <_Service>[
      _Service('Đăng ký ca', Icons.calendar_month_rounded, p.primary, p.primarySoft, AppRoutes.shift_register),
      _Service('Nghỉ phép', Icons.beach_access_rounded, p.success, p.successSoft, AppRoutes.leave_request_employee),
      _Service('Phiếu lương', Icons.account_balance_wallet_rounded, p.warning, p.warningSoft, AppRoutes.payslips),
      _Service('Bảng công', Icons.grid_view_rounded, pick(const Color(0xFF8CA6FF), const Color(0xFF3F55B8)),
          pick(const Color(0xFF222B55), const Color(0xFFE5E9FB)), AppRoutes.timesheet),
      _Service('Thông báo', Icons.notifications_active_rounded, pick(AppColors.violet, const Color(0xFF6A40D3)),
          pick(const Color(0xFF30234F), const Color(0xFFEEE8FD)), AppRoutes.notifications),
      _Service('Phúc lợi', Icons.favorite_rounded, pick(const Color(0xFFFF83B5), const Color(0xFFC12A6A)),
          pick(const Color(0xFF45223A), const Color(0xFFFDE6EF)), AppRoutes.policy_benefits),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tiện ích nhanh', style: AppText.h2(context)),
            const SizedBox(height: 14),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3,
              mainAxisSpacing: 9,
              crossAxisSpacing: 9,
              childAspectRatio: 1.18,
              // Mỗi ô hiện lần lượt (so le 80ms) và nhún nhẹ khi chạm.
              children: [
                for (var i = 0; i < items.length; i++)
                  FxReveal(
                    delay: Duration(milliseconds: 420 + 80 * i),
                    offset: 18,
                    child: FxPressScale(child: _tile(context, items[i])),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, _Service s) {
    return Semantics(
      button: true,
      label: s.title,
      child: Material(
        color: context.pal.isDark ? s.bg.withValues(alpha: .72) : s.bg,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: () => Navigator.pushNamed(context, s.route),
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: s.color.withValues(alpha: context.pal.isDark ? .34 : .28), width: 1.15),
              boxShadow: context.pal.isDark ? [BoxShadow(color: s.color.withValues(alpha: .07), blurRadius: 14, offset: const Offset(0, 5))] : null,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [s.color.withValues(alpha: .24), context.pal.isDark ? s.bg : context.pal.surface]),
                      border: Border.all(color: s.color.withValues(alpha: .55), width: 1.2),
                      boxShadow: context.pal.isDark ? [BoxShadow(color: s.color.withValues(alpha: .16), blurRadius: 10, spreadRadius: -1)] : null,
                    ),
                    child: Icon(s.icon, color: s.color, size: 22),
                  ),
                  const SizedBox(height: 6),
                  Text(s.title, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: context.pal.textPrimary),
                    textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 1),
                  Icon(Icons.arrow_outward_rounded, size: 11, color: s.color.withValues(alpha: .85)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Service {
  _Service(this.title, this.icon, this.color, this.bg, this.route);
  final String title;
  final IconData icon;
  final Color color;
  final Color bg;
  final String route;
}