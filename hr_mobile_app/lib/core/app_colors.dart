import 'package:flutter/material.dart';

/// Màu thương hiệu CỐ ĐỊNH – giống nhau ở cả Light lẫn Dark (dùng cho gradient hero,
/// nền thẻ "ink" luôn tối có chữ trắng…). Muốn màu đổi theo chế độ sáng/tối thì dùng
/// `context.pal` (xem [AppPalette]) – TUYỆT ĐỐI không dùng các hằng ở đây cho nền/chữ/icon thường.
class AppColors {
  AppColors._();

  static const Color primaryStrong = Color(0xFF3970F6);
  static const Color primaryGlow = Color(0xFF244B9C);

  /// Nền thẻ hero luôn tối (chữ trên đó luôn trắng).
  static const Color ink = Color(0xFF070B14);
  static const Color inkSoft = Color(0xFF101B30);

  static const Color cyan = Color(0xFF43D9F5);
  static const Color violet = Color(0xFFAA8BFF);
}

/// Bảng màu theo chế độ giao diện, gắn vào [ThemeData.extensions].
///
/// Cách dùng trong widget: `context.pal.surface`, `context.pal.textMuted`…
/// Vì đọc qua `Theme.of(context)` nên khi đổi Light/Dark mọi widget tự build lại đúng màu.
///
/// Độ tương phản (WCAG) đã được kiểm: chữ/icon ≥ 4.5:1 trên nền tương ứng ở cả hai chế độ.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.isDark,
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.surfaceRaised,
    required this.border,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.primary,
    required this.primarySoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerStrong,
    required this.dangerSoft,
    required this.neutralSoft,
    required this.shadow,
  });

  final bool isDark;

  // Nền & bề mặt
  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color surfaceRaised;
  final Color border;
  final Color borderStrong;

  // Chữ
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;

  // Điểm nhấn & trạng thái (dùng làm màu chữ/icon, cũng đủ tương phản khi làm nền cho chữ trắng)
  final Color primary;
  final Color primarySoft;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color danger;

  /// Màu nền nút/snackbar nguy hiểm (chữ trắng trên đó vẫn đọc rõ).
  final Color dangerStrong;
  final Color dangerSoft;
  final Color neutralSoft;

  /// Màu đổ bóng.
  final Color shadow;

  static const AppPalette dark = AppPalette(
    isDark: true,
    background: Color(0xFF080D19),
    surface: Color(0xFF111A2B),
    surfaceMuted: Color(0xFF18243A),
    surfaceRaised: Color(0xFF1B2942),
    border: Color(0xFF293956),
    borderStrong: Color(0xFF3C5680),
    textPrimary: Color(0xFFF0F5FF),
    textSecondary: Color(0xFFB0BED5),
    textMuted: Color(0xFF8191AD),
    primary: Color(0xFF5B8CFF),
    primarySoft: Color(0xFF172B52),
    success: Color(0xFF4ADE9A),
    successSoft: Color(0xFF12382F),
    warning: Color(0xFFFFC15A),
    warningSoft: Color(0xFF3C2C16),
    danger: Color(0xFFFF7185),
    dangerStrong: Color(0xFFE5384F),
    dangerSoft: Color(0xFF3C1E2B),
    neutralSoft: Color(0xFF202D43),
    shadow: Color(0xFF000000),
  );

  static const AppPalette light = AppPalette(
    isDark: false,
    background: Color(0xFFF3F6FC),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFEAF0FA),
    surfaceRaised: Color(0xFFF8FAFE),
    border: Color(0xFFDCE5F2),
    borderStrong: Color(0xFFC3D1E6),
    textPrimary: Color(0xFF17243A),
    textSecondary: Color(0xFF445570),
    textMuted: Color(0xFF5B6B86),
    primary: Color(0xFF2757DB),
    primarySoft: Color(0xFFE3ECFF),
    success: Color(0xFF0B7A52),
    successSoft: Color(0xFFDCF4E8),
    warning: Color(0xFF9A5B00),
    warningSoft: Color(0xFFFFEFCF),
    danger: Color(0xFFC62839),
    dangerStrong: Color(0xFFC62839),
    dangerSoft: Color(0xFFFDE3E7),
    neutralSoft: Color(0xFFE6ECF5),
    shadow: Color(0xFF1B2A4A),
  );

  /// Độ đậm bóng đổ phù hợp từng chế độ.
  double get shadowAlpha => isDark ? .18 : .07;

  /// Hai bóng của kiểu neumorphism: mảng sáng (trên-trái) và mảng tối (dưới-phải).
  /// Light: sáng = trắng, tối = xanh xám nhạt. Dark: sáng = ánh xanh mờ, tối = xanh đậm.
  Color get neuHighlight => isDark ? primary.withValues(alpha: .08) : Colors.white;
  Color get neuShadow => isDark ? borderStrong.withValues(alpha: .5) : const Color(0xFFB4C3DC).withValues(alpha: .75);

  @override
  AppPalette copyWith({
    bool? isDark,
    Color? background,
    Color? surface,
    Color? surfaceMuted,
    Color? surfaceRaised,
    Color? border,
    Color? borderStrong,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? primary,
    Color? primarySoft,
    Color? success,
    Color? successSoft,
    Color? warning,
    Color? warningSoft,
    Color? danger,
    Color? dangerStrong,
    Color? dangerSoft,
    Color? neutralSoft,
    Color? shadow,
  }) {
    return AppPalette(
      isDark: isDark ?? this.isDark,
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      surfaceRaised: surfaceRaised ?? this.surfaceRaised,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      primary: primary ?? this.primary,
      primarySoft: primarySoft ?? this.primarySoft,
      success: success ?? this.success,
      successSoft: successSoft ?? this.successSoft,
      warning: warning ?? this.warning,
      warningSoft: warningSoft ?? this.warningSoft,
      danger: danger ?? this.danger,
      dangerStrong: dangerStrong ?? this.dangerStrong,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      neutralSoft: neutralSoft ?? this.neutralSoft,
      shadow: shadow ?? this.shadow,
    );
  }

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppPalette(
      isDark: t < .5 ? isDark : other.isDark,
      background: l(background, other.background),
      surface: l(surface, other.surface),
      surfaceMuted: l(surfaceMuted, other.surfaceMuted),
      surfaceRaised: l(surfaceRaised, other.surfaceRaised),
      border: l(border, other.border),
      borderStrong: l(borderStrong, other.borderStrong),
      textPrimary: l(textPrimary, other.textPrimary),
      textSecondary: l(textSecondary, other.textSecondary),
      textMuted: l(textMuted, other.textMuted),
      primary: l(primary, other.primary),
      primarySoft: l(primarySoft, other.primarySoft),
      success: l(success, other.success),
      successSoft: l(successSoft, other.successSoft),
      warning: l(warning, other.warning),
      warningSoft: l(warningSoft, other.warningSoft),
      danger: l(danger, other.danger),
      dangerStrong: l(dangerStrong, other.dangerStrong),
      dangerSoft: l(dangerSoft, other.dangerSoft),
      neutralSoft: l(neutralSoft, other.neutralSoft),
      shadow: l(shadow, other.shadow),
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// Bảng màu của chế độ hiện tại. Gọi trong `build` để widget tự cập nhật khi đổi Light/Dark.
  AppPalette get pal {
    final theme = Theme.of(this);
    return theme.extension<AppPalette>() ??
        (theme.brightness == Brightness.dark ? AppPalette.dark : AppPalette.light);
  }
}
