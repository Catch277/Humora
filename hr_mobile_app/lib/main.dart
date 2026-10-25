import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart'; // Bỏ dấu '#' trên thanh URL
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_theme.dart';
import 'features/payroll/payroll_gate.dart';
import 'routes/app_routers.dart';

/// Giữ lại để các màn hình cũ còn tham chiếu; giao diện hiện chỉ có chế độ sáng.
final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.light);

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  usePathUrlStrategy();

  await Supabase.initialize(
    url: 'https://fnirmgvwsdvbcwevhhfx.supabase.co',
    publishableKey: 'sb_publishable_G8C8TTehw-_sYzP4kSXixQ_2atfw3Ig',
  );

  // Hết phiên / đăng xuất ở bất cứ đâu: khoá thông tin lương và về màn hình đăng nhập.
  Supabase.instance.client.auth.onAuthStateChange.listen((data) {
    if (data.event == AuthChangeEvent.signedOut) {
      PayrollGate.lock();
      navigatorKey.currentState?.pushNamedAndRemoveUntil(AppRoutes.login, (route) => false);
    }
  });

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final hasSession = Supabase.instance.client.auth.currentSession != null;
    return MaterialApp(
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Humora HR',
      themeMode: ThemeMode.light,
      theme: AppTheme.light(),
      // Đã đăng nhập từ trước thì vào thẳng trang chủ.
      initialRoute: hasSession ? AppRoutes.home_employee : AppRoutes.login,
      routes: AppRoutes.getRoutes(),
    );
  }
}
