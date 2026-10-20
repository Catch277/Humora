import 'package:flutter/material.dart';
import '../models/login_screen.dart';
import '../models/home_employee.dart';
import '../models/account_employee.dart';
import '../models/work_schedule_employee.dart';
import '../models/leave_request_employee.dart';
import '../models/policy_benefits.dart';

class AppRoutes {
  // 1. Định nghĩa Tên đường dẫn (Route Names)
  static const String initial = '/';
  static const String login = '/login';
  static const String home_employee = '/employee/home';
  static const String account_employee = '/employee/account';
  static const String work_schedule_employee = '/employee/work_schedule';
  static const String leave_request_employee = '/employee/leave_request';
  static const String policy_benefits = '/employee/policy_benefits';

  // Ví dụ các trang sau này bạn sẽ thêm vào:
  // static const String home = '/home';
  // static const String profile = '/profile';

  // 2. Map các tên đường dẫn với Screen/Widget tương ứng
  static Map<String, WidgetBuilder> getRoutes() {
    return {
           // Thêm route mặc định /
      login: (context) => const LoginScreen(),
      home_employee: (context) => const HomeEmployeeScreen(),
      account_employee: (context) => const AccountEmployeeScreen(),
      work_schedule_employee: (context) => const WorkScheduleScreen(),
      leave_request_employee: (context) => const LeaveRequestEmployeeScreen(),
      policy_benefits: (context) => const PolicyBenefitsScreen(),
      // home: (context) => const HomeScreen(),
      // profile: (context) => const ProfileScreen(),
    };
  }
}