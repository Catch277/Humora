import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:flutter_web_plugins/url_strategy.dart'; // Bỏ dấu '#' trên thanh URL
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_theme.dart';
import 'core/theme_controller.dart';
import 'features/payroll/payroll_gate.dart';
import 'routes/app_routers.dart';

// Giữ tương thích: code cũ vẫn `import main.dart` để dùng themeNotifier.
export 'core/theme_controller.dart' show themeNotifier;

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
    
    // Sử dụng ValueListenableBuilder để lắng nghe và rebuild toàn bộ ứng dụng 
    // ngay khi themeNotifier thay đổi giữa Light / Dark Mode.
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, currentThemeMode, child) {
        return MaterialApp(
          navigatorKey: navigatorKey,
          debugShowCheckedModeBanner: false,
          title: 'Humora HR',
          themeMode: currentThemeMode,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          // Đổi Light/Dark: màu nội suy mượt (AppPalette.lerp) thay vì nhảy cái rụp.
          themeAnimationDuration: const Duration(milliseconds: 550),
          themeAnimationCurve: Curves.easeInOutCubic,
          // Đã đăng nhập từ trước thì vào thẳng trang chủ.
          // Thanh trạng thái/điều hướng hệ thống đổi icon sáng–tối theo giao diện hiện tại.
          builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
            value: AppTheme.overlayFor(Theme.of(context).brightness),
            child: child ?? const SizedBox.shrink(),
          ),
          initialRoute: hasSession ? AppRoutes.home_employee : AppRoutes.login,
          // Chuyển trang Fade + Slide + Scale (xem AppRoutes.onGenerateRoute).
          onGenerateRoute: AppRoutes.onGenerateRoute,
        );
      },
    );
  } 
}