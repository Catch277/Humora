import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart'; // Bỏ dấu '#' trên thanh URL
import 'package:supabase_flutter/supabase_flutter.dart';
import 'routes/app_routers.dart';

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
      // Gọi route mặc định ban đầu từ AppRoutes
      initialRoute: AppRoutes.login,
      // Lấy toàn bộ danh sách routes từ file AppRoutes
      routes: AppRoutes.getRoutes(),
    );
  }
}
