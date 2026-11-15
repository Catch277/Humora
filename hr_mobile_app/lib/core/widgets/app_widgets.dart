
import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../app_theme.dart';

/// Thẻ giao diện dùng chung.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.onTap,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(24);
    final pal = context.pal;

    final cardSurface = color ?? pal.surface;

    final borderColor = pal.border;

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Material(
        color: cardSurface,
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(
                color: borderColor,
                width: 1.0,
              ),
              color: cardSurface,
              boxShadow: [
                BoxShadow(
                  color: pal.shadow.withValues(
                    alpha: pal.shadowAlpha,
                  ),
                  blurRadius: 20,
                  offset: const Offset(0, 7),
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

enum PillTone {
  success,
  warning,
  danger,
  info,
  neutral,
}

/// Nhãn trạng thái.
class StatusPill extends StatelessWidget {
  const StatusPill(
    this.text, {
    super.key,
    this.tone = PillTone.neutral,
    this.icon,
  });

  final String text;
  final PillTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    late final Color fg;
    late final Color bg;

    switch (tone) {
      case PillTone.success:
        fg = context.pal.success;
        bg = context.pal.successSoft;
        break;

      case PillTone.warning:
        fg = context.pal.warning;
        bg = context.pal.warningSoft;
        break;

      case PillTone.danger:
        fg = context.pal.danger;
        bg = context.pal.dangerSoft;
        break;

      case PillTone.info:
        fg = context.pal.primary;
        bg = context.pal.primarySoft;
        break;

      case PillTone.neutral:
        fg = context.pal.textSecondary;
        bg = context.pal.neutralSoft;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 11,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Tiêu đề của một nhóm nội dung.
class SectionTitle extends StatelessWidget {
  const SectionTitle(
    this.text, {
    super.key,
    this.trailing,
  });

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: AppText.h2(context),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Khung một trang con.
class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.trailing,
    this.bottomNavigationBar,
    this.showBack = true,
    this.onRefresh,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final Widget? bottomNavigationBar;
  final bool showBack;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    Widget body = child;

    if (onRefresh != null) {
      body = RefreshIndicator(
        onRefresh: onRefresh!,
        child: child,
      );
    }

    final fg = context.pal.textPrimary;

    return Scaffold(
      backgroundColor: context.pal.background,
      bottomNavigationBar: bottomNavigationBar,
      body: SafeArea(
        bottom: bottomNavigationBar == null,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                8, 8, 16, 8,
              ),
              child: Row(
                children: [
                  if (showBack)
                    Padding(
                      padding: const EdgeInsets.only(
                        right: 8,
                      ),
                      child: Material(
                        color: context.pal.surface,
                        shape: CircleBorder(
                          side: BorderSide(
                            color: context.pal.border,
                          ),
                        ),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () =>
                              Navigator.maybePop(context),
                          child: SizedBox(
                            width: 40,
                            height: 40,
                            child: Icon(
                              Icons.arrow_back_ios_new_rounded,
                              size: 17,
                              color: fg,
                            ),
                          ),
                        ),
                      ),
                    )
                  else
                    const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: AppText.h1(context).copyWith(
                            fontSize: 24,
                            letterSpacing: -0.3,
                          ),
                        ),
                        if (subtitle != null)
                          Padding(
                            padding: const EdgeInsets.only(
                              top: 2,
                            ),
                            child: Text(
                              subtitle!,
                              style: AppText.caption(context),
                            ),
                          ),
                      ],
                    ),
                  ),

                  if (trailing != null) trailing!,
                ],
              ),
            ),

            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// Trạng thái rỗng.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        32, 56, 32, 32,
      ),
      children: [
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: context.pal.primarySoft,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              size: 32,
              color: context.pal.primary,
            ),
          ),
        ),

        const SizedBox(height: 18),

        Text(
          title,
          textAlign: TextAlign.center,
          style: AppText.h2(context),
        ),

        if (message != null) ...[
          const SizedBox(height: 8),
          Text(
            message!,
            textAlign: TextAlign.center,
            style: AppText.bodyMuted(context),
          ),
        ],

        if (actionLabel != null && onAction != null) ...[
          const SizedBox(height: 20),
          Center(
            child: OutlinedButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ),
        ],
      ],
    );
  }
}

/// Lỗi tải dữ liệu.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.cloud_off_rounded,
      title: 'Không tải được dữ liệu',
      message: message,
      actionLabel: 'Thử lại',
      onAction: onRetry,
    );
  }
}

/// Gói ba trạng thái tải / lỗi / có dữ liệu.
class AsyncBody extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.loading,
    required this.error,
    required this.onRetry,
    required this.builder,
  });

  final bool loading;
  final String? error;
  final VoidCallback onRetry;
  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const SkeletonList();
    }

    if (error != null) {
      return ErrorState(
        message: error!,
        onRetry: onRetry,
      );
    }

    return builder(context);
  }
}

/// Khung xương khi đang tải.
class SkeletonList extends StatefulWidget {
  const SkeletonList({
    super.key,
    this.count = 4,
  });

  final int count;

  @override
  State<SkeletonList> createState() =>
      _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final color = Color.lerp(
          context.pal.surfaceMuted,
          context.pal.border,
          _c.value,
        )!;

        return ListView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            16, 8, 16, 16,
          ),
          itemCount: widget.count,
          itemBuilder: (context, i) => Container(
            height: 84,
            margin: const EdgeInsets.only(
              bottom: 12,
            ),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        );
      },
    );
  }
}

/// Nút chính.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.danger = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: danger
              ? context.pal.dangerStrong
              : context.pal.primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: busy
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: Colors.white,
                ),
              )
            : Row(
                mainAxisAlignment:
                    MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18),
                    const SizedBox(width: 8),
                  ],
                  Text(label),
                ],
              ),
      ),
    );
  }
}

/// Dải thông tin / cảnh báo ngắn.
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.text,
    this.icon = Icons.info_outline_rounded,
    this.tone = PillTone.info,
  });

  final String text;
  final IconData icon;
  final PillTone tone;

  @override
  Widget build(BuildContext context) {
    Color fg = context.pal.primary;
    Color bg = context.pal.primarySoft;

    if (tone == PillTone.warning) {
      fg = context.pal.warning;
      bg = context.pal.warningSoft;
    } else if (tone == PillTone.danger) {
      fg = context.pal.danger;
      bg = context.pal.dangerSoft;
    } else if (tone == PillTone.success) {
      fg = context.pal.success;
      bg = context.pal.successSoft;
    } else if (tone == PillTone.neutral) {
      fg = context.pal.textSecondary;
      bg = context.pal.neutralSoft;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 18,
            color: fg,
          ),

          const SizedBox(width: 10),

          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: fg,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Thông báo nhanh dưới đáy màn hình.
void showAppSnack(
  BuildContext context,
  String text, {
  bool error = false,
}) {
  final messenger = ScaffoldMessenger.of(context);

  messenger.hideCurrentSnackBar();

  messenger.showSnackBar(
    SnackBar(
      content: Text(text),
      behavior: SnackBarBehavior.floating,
      backgroundColor:
          error ? context.pal.dangerStrong : AppColors.inkSoft,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    ),
  );
}
