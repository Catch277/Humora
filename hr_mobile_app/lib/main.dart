import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart'; // Bỏ dấu '#' trên thanh URL
import 'package:supabase_flutter/supabase_flutter.dart';
import 'routes/app_routers.dart';


// Biến ValueNotifier quản lý ThemeMode toàn ứng dụng
final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.light);
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Bỏ dấu # trên thanh URL trình duyệt (thành http://localhost:PORT/login)
  usePathUrlStrategy();
  
  // Khởi tạo kết nối với Supabase
  await Supabase.initialize(
    url: 'https://fnirmgvwsdvbcwevhhfx.supabase.co', // URL dự án của bạn
    publishableKey: 'sb_publishable_G8C8TTehw-_sYzP4kSXixQ_2atfw3Ig',
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false, // <-- Thêm dòng này để ẩn dải băng DEBUG
      title: 'Human Resource App',

      // Cấu hình Theme Sáng / Tối
          themeMode: themeNotifier.value,
          theme: ThemeData(
            brightness: Brightness.light,
            scaffoldBackgroundColor: const Color(0xFFF4F6FC),
            cardColor: Colors.white,
            useMaterial3: true,
          ),
          darkTheme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: const Color(0xFF121212),
            cardColor: const Color(0xFF1E1E1E),
            useMaterial3: true,
          ),
          
      // Gọi route mặc định ban đầu từ AppRoutes
      initialRoute: AppRoutes.login,
      // Lấy toàn bộ danh sách routes từ file AppRoutes
      routes: AppRoutes.getRoutes(),
    );
  }
}