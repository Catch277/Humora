import 'package:flutter/material.dart';
import '../core/app_colors.dart';
import '../data/services/notification_service.dart';
import '../routes/app_routers.dart';

/// Thanh điều hướng chính: Trang chủ • Lịch làm • Thông báo • Tài khoản.
class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int>? onTap;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    this.onTap,
  });

  void _handleTap(BuildContext context, int index) {
    onTap?.call(index);
    if (index == currentIndex) return;

    const routes = [
      AppRoutes.home_employee,
      AppRoutes.work_schedule_employee,
      AppRoutes.notifications,
      AppRoutes.account_employee,
    ];
    Navigator.pushReplacementNamed(context, routes[index]);
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: NavigationBar(
        selectedIndex: currentIndex,
        height: 66,
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: AppColors.primarySoft,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (i) => _handleTap(context, i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded, color: AppColors.primary),
            label: 'Trang chủ',
          ),
          const NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month_rounded, color: AppColors.primary),
            label: 'Lịch làm',
          ),
          NavigationDestination(
            icon: ValueListenableBuilder<int>(
              valueListenable: NotificationService.unreadCount,
              builder: (_, n, __) => Badge(
                isLabelVisible: n > 0,
                label: Text(n > 99 ? '99+' : '$n'),
                child: const Icon(Icons.notifications_none_rounded),
              ),
            ),
            selectedIcon: const Icon(Icons.notifications_rounded, color: AppColors.primary),
            label: 'Thông báo',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded, color: AppColors.primary),
            label: 'Tài khoản',
          ),
        ],
      ),
    );
  }
}
