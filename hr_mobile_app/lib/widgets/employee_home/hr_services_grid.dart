import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../routes/app_routers.dart';

class HrServicesGrid extends StatelessWidget {
  const HrServicesGrid({super.key});

  @override
  Widget build(BuildContext context) {
    final items = <_Service>[
      _Service('Lịch làm việc', Icons.calendar_month_outlined, AppColors.primary, AppColors.primarySoft,
          AppRoutes.work_schedule_employee),
      _Service('Nghỉ phép', Icons.event_busy_outlined, AppColors.success, AppColors.successSoft,
          AppRoutes.leave_request_employee),
      _Service('Phiếu lương', Icons.receipt_long_outlined, AppColors.warning, AppColors.warningSoft,
          AppRoutes.payslips),
      _Service('Bảng công', Icons.fact_check_outlined, const Color(0xFF4F46E5), const Color(0xFFEEF2FF),
          AppRoutes.timesheet),
      _Service('Thông báo', Icons.notifications_none_rounded, const Color(0xFF7C3AED), const Color(0xFFF3E8FF),
          AppRoutes.notifications),
      _Service('Phúc lợi', Icons.favorite_border_rounded, const Color(0xFFDB2777), const Color(0xFFFCE7F3),
          AppRoutes.policy_benefits),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Dịch vụ nhân sự', style: AppText.h2),
            const SizedBox(height: 14),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3,
              mainAxisSpacing: 12,
              crossAxisSpacing: 8,
              childAspectRatio: 1.05,
              children: items.map((s) => _tile(context, s)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, _Service s) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, s.route),
      borderRadius: BorderRadius.circular(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(16)),
            child: Icon(s.icon, color: s.color, size: 24),
          ),
          const SizedBox(height: 7),
          Text(
            s.title,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
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
