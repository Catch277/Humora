import 'package:flutter/material.dart';
import '../core/app_colors.dart';
import '../data/services/notification_service.dart';
import '../routes/app_routers.dart';

/// Thanh điều hướng chính: Trang chủ • Chấm công • Lịch làm • Thông báo • Cá nhân.
class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int>? onTap;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    this.onTap,
  });

  static const List<String> _routes = [
    AppRoutes.home_employee,
    AppRoutes.timesheet,
    AppRoutes.work_schedule_employee,
    AppRoutes.notifications,
    AppRoutes.account_employee,
  ];

  void _handleTap(BuildContext context, int index) {
    onTap?.call(index);
    if (index == currentIndex) return;
    Navigator.pushNamedAndRemoveUntil(context, _routes[index], (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0C2A5E).withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
          child: Row(
            children: [
              _item(context, 0, Icons.home_outlined, Icons.home_rounded, 'Trang chủ'),
              _item(context, 1, Icons.fact_check_outlined, Icons.fact_check_rounded, 'Chấm công'),
              _item(context, 2, Icons.calendar_month_outlined, Icons.calendar_month_rounded, 'Lịch làm'),
              _item(context, 3, Icons.notifications_none_rounded, Icons.notifications_rounded, 'Thông báo',
                  badge: true),
              _item(context, 4, Icons.person_outline_rounded, Icons.person_rounded, 'Cá nhân'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(
    BuildContext context,
    int index,
    IconData icon,
    IconData selectedIcon,
    String label, {
    bool badge = false,
  }) {
    final selected = index == currentIndex;
    final color = selected ? AppColors.primary : AppColors.textMuted;

    Widget iconWidget = Icon(selected ? selectedIcon : icon, size: 24, color: color);
    if (badge) {
      iconWidget = ValueListenableBuilder<int>(
        valueListenable: NotificationService.unreadCount,
        builder: (_, n, __) => Badge(
          isLabelVisible: n > 0,
          label: Text(n > 99 ? '99+' : '$n'),
          child: Icon(selected ? selectedIcon : icon, size: 24, color: color),
        ),
      );
    }

    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        child: InkWell(
        onTap: () => _handleTap(context, index),
        borderRadius: BorderRadius.circular(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              width: 48,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? AppColors.primarySoft : Colors.transparent,
                borderRadius: BorderRadius.circular(15),
              ),
              child: iconWidget,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }
}
