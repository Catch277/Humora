import 'package:flutter/material.dart';

/// Chế độ giao diện hiện tại. Mặc định là Dark; đổi giá trị để chuyển Light/Dark toàn app.
final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.dark);
