import 'package:flutter/material.dart';

/// Bảng màu dùng chung. Khớp với web (design.md): một màu thương hiệu xanh #0C66E4,
/// màu trạng thái chỉ dùng để biểu thị trạng thái, không dùng để trang trí.
class AppColors {
  AppColors._();

  // Thương hiệu
  static const Color primary = Color(0xFF0C66E4);
  static const Color primaryStrong = Color(0xFF1D4ED8);
  static const Color primarySoft = Color(0xFFE9F1FE);

  // Nền & bề mặt
  static const Color background = Color(0xFFF6F8FD);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F4FA);
  static const Color border = Color(0xFFE3E8F1);

  // Chữ
  static const Color textPrimary = Color(0xFF172033);
  static const Color textSecondary = Color(0xFF5B6678);
  static const Color textMuted = Color(0xFF8A94A6);

  // Trạng thái
  static const Color success = Color(0xFF12803D);
  static const Color successSoft = Color(0xFFE6F6EC);
  static const Color warning = Color(0xFFB45309);
  static const Color warningSoft = Color(0xFFFEF3C7);
  static const Color danger = Color(0xFFD92D20);
  static const Color dangerSoft = Color(0xFFFDECEA);
  static const Color neutralSoft = Color(0xFFEEF1F6);

  // Thẻ nổi bật (thu nhập)
  static const Color ink = Color(0xFF111A2E);
  static const Color inkSoft = Color(0xFF1B2742);
}
