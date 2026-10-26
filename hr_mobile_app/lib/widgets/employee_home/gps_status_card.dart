import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Tình trạng định vị của thiết bị (không phải khoảng cách tới văn phòng; máy chủ chưa cung cấp toạ độ văn phòng).
enum GpsState { checking, ready, serviceOff, denied, deniedForever }

class GpsStatusCard extends StatelessWidget {
  const GpsStatusCard({super.key, required this.state, required this.onAction});

  final GpsState state;

  /// Hành động sửa lỗi: bật GPS / xin quyền / mở cài đặt, hoặc kiểm tra lại.
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    late final String title;
    late final String message;
    late final String? action;
    late final PillTone tone;
    late final IconData icon;

    switch (state) {
      case GpsState.checking:
        title = 'Đang kiểm tra vị trí';
        message = 'Vui lòng chờ trong giây lát.';
        action = null;
        tone = PillTone.neutral;
        icon = Icons.my_location_rounded;
        break;
      case GpsState.ready:
        title = 'GPS đã sẵn sàng';
        message = 'Bạn có thể chấm công. Vị trí được lấy khi bạn bấm nút.';
        action = null;
        tone = PillTone.success;
        icon = Icons.location_on_rounded;
        break;
      case GpsState.serviceOff:
        title = 'GPS đang tắt';
        message = 'Hãy bật định vị trên thiết bị để chấm công.';
        action = 'Bật GPS';
        tone = PillTone.danger;
        icon = Icons.location_off_rounded;
        break;
      case GpsState.denied:
        title = 'Chưa có quyền vị trí';
        message = 'Cho phép ứng dụng truy cập vị trí để chấm công.';
        action = 'Cấp quyền';
        tone = PillTone.warning;
        icon = Icons.location_disabled_rounded;
        break;
      case GpsState.deniedForever:
        title = 'Quyền vị trí bị chặn';
        message = 'Mở Cài đặt và cho phép vị trí cho ứng dụng.';
        action = 'Mở cài đặt';
        tone = PillTone.danger;
        icon = Icons.location_disabled_rounded;
        break;
    }

    final Color fg = tone == PillTone.success
        ? AppColors.success
        : tone == PillTone.warning
            ? AppColors.warning
            : tone == PillTone.danger
                ? AppColors.danger
                : AppColors.textSecondary;
    final Color bg = tone == PillTone.success
        ? AppColors.successSoft
        : tone == PillTone.warning
            ? AppColors.warningSoft
            : tone == PillTone.danger
                ? AppColors.dangerSoft
                : AppColors.neutralSoft;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: fg, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.title),
                  const SizedBox(height: 2),
                  Text(message, style: AppText.caption),
                ],
              ),
            ),
            if (action != null)
              TextButton(
                onPressed: onAction,
                child: Text(action, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
          ],
        ),
      ),
    );
  }
}
