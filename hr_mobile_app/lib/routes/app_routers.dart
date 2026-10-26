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
