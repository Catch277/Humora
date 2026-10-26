import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/ui_kit.dart';

/// Trạng thái chấm công hiện tại của nhân viên trong ngày.
enum CheckInPhase {
  /// Hôm nay không có ca nào để chấm công.
  noShift,

  /// Có ca, chưa vào ca.
  ready,

  /// Đang trong ca (đã vào, chưa ra).
  working,

  /// Đã vào và ra hết các ca hôm nay.
  done,
}

/// Thẻ đồng hồ: giờ hiện tại, thứ, ngày tháng, múi giờ.
/// Không chứa dữ liệu cố định: mọi chữ hiển thị đều do màn hình cha truyền vào.
class ClockCard extends StatelessWidget {
  const ClockCard({
    super.key,
    required this.timeFormat,
    required this.period,
    required this.dateText,
    required this.timezone,
  });

  final String timeFormat;
  final String period;
  final String dateText;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        timeFormat,
                        style: const TextStyle(
                          fontSize: 40,
                          height: 1,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                          letterSpacing: -1,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          period,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(dateText, style: AppText.bodyMuted.copyWith(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            StatusPill(timezone, tone: PillTone.info, icon: Icons.public_rounded),
          ],
        ),
      ),
    );
  }
}

/// Thẻ ca làm hôm nay: tên ca, giờ, trạng thái, giờ vào thực tế.
class TodayShiftCard extends StatelessWidget {
  const TodayShiftCard({
    super.key,
    required this.phase,
    required this.shiftLabel,
    required this.countdownText,
    required this.checkInTime,
  });

  final CheckInPhase phase;
  final String shiftLabel;
  final String countdownText;
  final String checkInTime;

  @override
  Widget build(BuildContext context) {
    late final String status;
    late final PillTone tone;
    late final IconData icon;
    switch (phase) {
      case CheckInPhase.noShift:
        status = 'Không có ca';
        tone = PillTone.neutral;
        icon = Icons.event_busy_outlined;
        break;
      case CheckInPhase.ready:
        status = 'Chưa vào ca';
        tone = PillTone.info;
        icon = Icons.hourglass_empty_rounded;
        break;
      case CheckInPhase.working:
        status = 'Đang trong ca';
        tone = PillTone.success;
        icon = Icons.play_circle_outline_rounded;
        break;
      case CheckInPhase.done:
        status = 'Đã hoàn tất';
        tone = PillTone.success;
        icon = Icons.check_circle_outline_rounded;
        break;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(child: Text('CA LÀM HÔM NAY', style: AppText.label)),
                StatusPill(status, tone: tone, icon: icon),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.work_history_outlined, color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(shiftLabel, style: AppText.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (phase == CheckInPhase.ready || phase == CheckInPhase.noShift)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(countdownText, style: AppText.caption.copyWith(color: AppColors.primary)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: AppColors.surfaceMuted, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Icon(Icons.login_rounded, size: 18, color: phase == CheckInPhase.working ? AppColors.success : AppColors.textMuted),
                  const SizedBox(width: 8),
                  const Text('Giờ vào thực tế', style: AppText.bodyMuted),
                  const Spacer(),
                  Text(checkInTime, style: AppText.money.copyWith(fontSize: 14)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Khu vực chấm công trung tâm: nút tròn lớn + nhãn hành động + hướng dẫn.
class CheckInAction extends StatelessWidget {
  const CheckInAction({
    super.key,
    required this.phase,
    required this.busy,
    required this.success,
    required this.onPressed,
  });

  final CheckInPhase phase;
  final bool busy;

  /// Bật trong ít giây sau khi chấm công thành công để hiện dấu tích.
  final bool success;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = (phase == CheckInPhase.ready || phase == CheckInPhase.working) && !busy;
    final checkingOut = phase == CheckInPhase.working;

    final String label;
    switch (phase) {
      case CheckInPhase.noShift:
        label = 'Hôm nay không có ca';
        break;
      case CheckInPhase.ready:
        label = 'Chạm để chấm công vào';
        break;
      case CheckInPhase.working:
        label = 'Chạm để chấm công ra';
        break;
      case CheckInPhase.done:
        label = 'Đã hoàn tất chấm công hôm nay';
        break;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
        child: Column(
          children: [
            _RoundButton(
              phase: phase,
              enabled: enabled,
              busy: busy,
              success: success,
              checkingOut: checkingOut,
              onPressed: onPressed,
            ),
            const SizedBox(height: 16),
            Text(label, style: AppText.title, textAlign: TextAlign.center),
            const SizedBox(height: 14),
            const _Hint(Icons.location_on_outlined, 'Bật GPS và cho phép ứng dụng truy cập vị trí.'),
            const SizedBox(height: 6),
            const _Hint(Icons.photo_camera_outlined, 'Hệ thống sẽ chụp ảnh xác thực khi chấm công.'),
          ],
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: AppColors.textMuted),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: AppText.caption)),
      ],
    );
  }
}

class _RoundButton extends StatefulWidget {
  const _RoundButton({
    required this.phase,
    required this.enabled,
    required this.busy,
    required this.success,
    required this.checkingOut,
    required this.onPressed,
  });

  final CheckInPhase phase;
  final bool enabled;
  final bool busy;
  final bool success;
  final bool checkingOut;
  final VoidCallback onPressed;

  @override
  State<_RoundButton> createState() => _RoundButtonState();
}

class _RoundButtonState extends State<_RoundButton> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  bool _pressed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncPulse();
  }

  @override
  void didUpdateWidget(covariant _RoundButton old) {
    super.didUpdateWidget(old);
    _syncPulse();
  }

  /// Chỉ nhấp nháy nhẹ khi sẵn sàng; tắt khi đang xử lý hoặc người dùng bật "giảm chuyển động".
  void _syncPulse() {
    final shouldPulse = widget.enabled && !widget.success && !reduceMotion(context);
    if (shouldPulse && !_pulse.isAnimating) {
      _pulse.repeat();
    } else if (!shouldPulse && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Color base = !widget.enabled && !widget.busy
        ? (widget.phase == CheckInPhase.done ? AppColors.success : AppColors.border)
        : (widget.checkingOut ? AppColors.danger : AppColors.primary);

    final IconData icon = widget.success
        ? Icons.check_rounded
        : widget.phase == CheckInPhase.done
            ? Icons.check_rounded
            : widget.phase == CheckInPhase.noShift
                ? Icons.event_busy_outlined
                : widget.checkingOut
                    ? Icons.logout_rounded
                    : Icons.fingerprint_rounded;

    final fgColor = (widget.phase == CheckInPhase.noShift) ? AppColors.textMuted : Colors.white;

    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: widget.checkingOut ? 'Chấm công ra' : 'Chấm công vào',
      child: SizedBox(
        width: 190,
        height: 190,
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (widget.enabled)
              AnimatedBuilder(
                animation: _pulse,
                builder: (_, __) {
                  final t = _pulse.value;
                  return Container(
                    width: 150 + 40 * t,
                    height: 150 + 40 * t,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: base.withValues(alpha: 0.16 * (1 - t)),
                    ),
                  );
                },
              ),
            AnimatedScale(
              scale: _pressed ? 0.94 : 1,
              duration: const Duration(milliseconds: 100),
              child: Material(
                color: base,
                shape: const CircleBorder(),
                elevation: widget.enabled ? 6 : 0,
                shadowColor: base.withValues(alpha: 0.5),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: widget.enabled ? widget.onPressed : null,
                  onHighlightChanged: (v) => setState(() => _pressed = v && widget.enabled),
                  child: SizedBox(
                    width: 144,
                    height: 144,
                    child: Center(
                      child: widget.busy
                          ? const SizedBox(
                              width: 44,
                              height: 44,
                              child: CircularProgressIndicator(strokeWidth: 3.4, color: Colors.white),
                            )
                          : AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              child: Icon(icon, key: ValueKey(icon), size: 64, color: fgColor),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
