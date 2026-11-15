import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'app_colors.dart';

/// Kiểu chữ dùng chung. Mỗi kiểu nhận [BuildContext] để lấy màu đúng theo Light/Dark:
/// `Text('...', style: AppText.title(context))`.
class AppText {
  AppText._();

  static TextStyle h1(BuildContext c) => TextStyle(fontSize: 25, fontWeight: FontWeight.w800, color: c.pal.textPrimary, height: 1.2, letterSpacing: -0.5);
  static TextStyle h2(BuildContext c) => TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c.pal.textPrimary, height: 1.25, letterSpacing: -0.2);
  static TextStyle title(BuildContext c) => TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.pal.textPrimary, height: 1.3);
  static TextStyle body(BuildContext c) => TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: c.pal.textPrimary, height: 1.45);
  static TextStyle bodyMuted(BuildContext c) => TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.pal.textSecondary, height: 1.4);
  static TextStyle caption(BuildContext c) => TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.pal.textMuted, height: 1.35);
  static TextStyle label(BuildContext c) => TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: c.pal.textMuted, letterSpacing: 1.1);

  /// Số tiền / số liệu: chữ số đều nhau (tabular) để cột số thẳng hàng, màu chữ chính để luôn rõ.
  static TextStyle money(BuildContext c) => TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: c.pal.textPrimary, fontFeatures: const [FontFeature.tabularFigures()]);
}

class AppTheme {
  AppTheme._();
  static ThemeData light() => _build(AppPalette.light);
  static ThemeData dark() => _build(AppPalette.dark);

  /// Thanh trạng thái hệ thống: icon tối trên nền sáng, icon sáng trên nền tối.
  static SystemUiOverlayStyle overlayFor(Brightness b) {
    final dark = b == Brightness.dark;
    return SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: dark ? Brightness.light : Brightness.dark, // Android
      statusBarBrightness: dark ? Brightness.dark : Brightness.light, // iOS
      systemNavigationBarColor: dark ? AppPalette.dark.surface : AppPalette.light.surface,
      systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    );
  }

  static ThemeData _build(AppPalette p) {
    final brightness = p.isDark ? Brightness.dark : Brightness.light;

    final scheme = ColorScheme.fromSeed(seedColor: AppColors.primaryStrong, brightness: brightness).copyWith(
      primary: p.isDark ? AppColors.primaryStrong : p.primary,
      onPrimary: Colors.white,
      secondary: p.primary,
      surface: p.surface,
      onSurface: p.textPrimary,
      onSurfaceVariant: p.textSecondary,
      surfaceContainerLowest: p.background,
      surfaceContainerLow: p.surface,
      surfaceContainer: p.surface,
      surfaceContainerHigh: p.surfaceMuted,
      surfaceContainerHighest: p.surfaceRaised,
      error: p.danger,
      onError: p.isDark ? AppColors.ink : Colors.white,
      outline: p.borderStrong,
      outlineVariant: p.border,
    );

    final roundedField = (Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: c, width: w));

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      extensions: <ThemeExtension<dynamic>>[p],
      scaffoldBackgroundColor: p.background,
      canvasColor: p.background,
      cardColor: p.surface,
      dividerColor: p.border,
      splashFactory: InkSparkle.splashFactory,
      // Icon mặc định (không chỉ định màu) dùng màu chữ phụ → luôn đọc được ở cả hai chế độ.
      iconTheme: IconThemeData(color: p.textSecondary),
      primaryIconTheme: IconThemeData(color: p.textPrimary),
      appBarTheme: AppBarTheme(
        backgroundColor: p.background,
        foregroundColor: p.textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: p.textPrimary),
        actionsIconTheme: IconThemeData(color: p.textPrimary),
        systemOverlayStyle: overlayFor(brightness),
      ),
      textTheme: ThemeData(brightness: brightness).textTheme.apply(bodyColor: p.textPrimary, displayColor: p.textPrimary),
      dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),
      listTileTheme: ListTileThemeData(iconColor: p.textSecondary, textColor: p.textPrimary),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surfaceMuted,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        hintStyle: TextStyle(color: p.textMuted),
        labelStyle: TextStyle(color: p.textSecondary),
        floatingLabelStyle: TextStyle(color: p.primary),
        prefixIconColor: p.textSecondary,
        suffixIconColor: p.textSecondary,
        border: roundedField(p.border),
        enabledBorder: roundedField(p.border),
        focusedBorder: roundedField(p.primary, 1.6),
        errorBorder: roundedField(p.danger),
        focusedErrorBorder: roundedField(p.danger, 1.6),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryStrong,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: .1),
          elevation: 3,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: p.surfaceMuted,
          disabledForegroundColor: p.textMuted,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.primary,
          side: BorderSide(color: p.borderStrong),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: p.primary, textStyle: const TextStyle(fontWeight: FontWeight.w800)),
      ),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: p.textPrimary)),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: p.primary,
        selectionColor: p.primary.withValues(alpha: .35),
        selectionHandleColor: p.primary,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.primary, linearTrackColor: p.surfaceMuted),
      chipTheme: ChipThemeData(
        backgroundColor: p.surface,
        selectedColor: p.primary,
        disabledColor: p.surfaceMuted,
        side: BorderSide(color: p.border),
        labelStyle: TextStyle(color: p.textSecondary),
        secondaryLabelStyle: const TextStyle(color: Colors.white),
        iconTheme: IconThemeData(color: p.textSecondary),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.primary : Colors.transparent),
        checkColor: const WidgetStatePropertyAll(Colors.white),
        side: BorderSide(color: p.textMuted, width: 1.6),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : p.textMuted),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.primary : p.surfaceMuted),
        trackOutlineColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.transparent : p.borderStrong),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        modalBackgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: p.isDark ? p.surfaceRaised : AppColors.inkSoft,
        contentTextStyle: const TextStyle(color: Colors.white),
        actionTextColor: p.isDark ? p.primary : const Color(0xFF9DBBFF),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: p.isDark ? p.surfaceRaised : AppColors.inkSoft, borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }
}
