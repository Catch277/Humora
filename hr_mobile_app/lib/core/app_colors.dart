import 'package:flutter/material.dart';

/// Bảng màu dùng chung. Khớp với web (design.md): một màu thương hiệu xanh #2563EB,
/// màu trạng thái chỉ dùng để biểu thị trạng thái, không dùng để trang trí.
class AppColors {
  AppColors._();

  // Thương hiệu
  static const Color primary = Color(0xFF2563EB);
  static const Color primaryStrong = Color(0xFF1D4ED8);
  static const Color primarySoft = Color(0xFFEFF6FF);

  // Nền & bề mặt
  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F4FA);
  static const Color border = Color(0xFFE2E8F0);

  // Chữ
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textMuted = Color(0xFF8A94A6);

  // Trạng thái
  static const Color success = Color(0xFF16A34A);
  static const Color successSoft = Color(0xFFDCFCE7);
  // Chữ cảnh báo dùng #B45309 (đủ tương phản trên nền vàng nhạt); #F59E0B dùng cho viền/chấm.
  static const Color warning = Color(0xFFB45309);
  static const Color warningAccent = Color(0xFFF59E0B);
  static const Color warningSoft = Color(0xFFFEF3C7);
  static const Color danger = Color(0xFFDC2626);
  static const Color dangerSoft = Color(0xFFFEE2E2);
  static const Color neutralSoft = Color(0xFFEEF1F6);

  // Thẻ nổi bật (thu nhập)
  static const Color ink = Color(0xFF111A2E);
  static const Color inkSoft = Color(0xFF1B2742);
}
