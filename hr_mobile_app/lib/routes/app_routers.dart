import 'package:flutter/material.dart';
import '../models/login_screen.dart';
import '../models/home_employee.dart';
import '../models/account_employee.dart';
import '../models/leave_request_employee.dart';
import '../models/policy_benefits.dart';
import '../features/payroll/payslip_list_screen.dart';
import '../features/timesheet/timesheet_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/schedule/schedule_screen.dart';
import '../features/schedule/shift_register_screen.dart';

class AppRoutes {
  // Tên đường dẫn
  static const String initial = '/';
  static const String login = '/login';
  static const String home_employee = '/employee/home';
  static const String account_employee = '/employee/account';
  static const String work_schedule_employee = '/employee/work_schedule';
  static const String leave_request_employee = '/employee/leave_request';
  static const String policy_benefits = '/employee/policy_benefits';
  static const String payslips = '/employee/payslips';
  static const String timesheet = '/employee/timesheet';
  static const String notifications = '/employee/notifications';
  static const String shift_register = '/employee/shift_register';

  /// Chuyển trang có chiều sâu: trang mới mờ dần + trượt nhẹ + phóng từ 98.5% → 100%,
  /// trong khi trang cũ lùi nhẹ sang trái. Dùng chung cho mọi route có tên.
  static Route<dynamic>? onGenerateRoute(RouteSettings settings) {
    final pageBuilder = getRoutes()[settings.name];
    if (pageBuilder == null) return null;

    return PageRouteBuilder<dynamic>(
      settings: settings,
      pageBuilder: (context, animation, secondaryAnimation) =>
          pageBuilder(context),
      transitionDuration: const Duration(milliseconds: 380),
      reverseTransitionDuration: const Duration(milliseconds: 280),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        // Hệ thống bật "Reduce motion" → chuyển trang tức thì.
        if (MediaQuery.disableAnimationsOf(context)) return child;

        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        final back = CurvedAnimation(
          parent: secondaryAnimation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );

        final slideIn = Tween<Offset>(
          begin: const Offset(0.045, 0),
          end: Offset.zero,
        ).animate(curved);
        final scaleIn = Tween<double>(begin: 0.985, end: 1).animate(curved);
        final slideOut = Tween<Offset>(
          begin: Offset.zero,
          end: const Offset(-0.025, 0),
        ).animate(back);

        return SlideTransition(
          position: slideOut,
          child: FadeTransition(
            opacity: curved,
            child: SlideTransition(
              position: slideIn,
              child: ScaleTransition(scale: scaleIn, child: child),
            ),
          ),
        );
      },
    );
  }

  static Map<String, WidgetBuilder> getRoutes() {
    return {
      login: (context) => const LoginScreen(),
      home_employee: (context) => const HomeEmployeeScreen(),
      account_employee: (context) => const AccountEmployeeScreen(),
      work_schedule_employee: (context) => const ScheduleScreen(),
      leave_request_employee: (context) => const LeaveRequestEmployeeScreen(),
      policy_benefits: (context) => const PolicyBenefitsScreen(),
      payslips: (context) => const PayslipListScreen(),
      timesheet: (context) => const TimesheetScreen(),
      notifications: (context) => const NotificationsScreen(),
      shift_register: (context) => const ShiftRegisterScreen(),
    };
  }
}