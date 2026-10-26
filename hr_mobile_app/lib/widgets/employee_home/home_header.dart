import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../data/services/notification_service.dart';
import '../../routes/app_routers.dart';

/// Đầu trang chủ: avatar, lời chào, tên nhân viên và chuông thông báo.
/// Nền sáng, không gradient; chạm vào avatar để mở trang cá nhân.
class HomeHeader extends StatefulWidget {
  final String formattedDate;
  final String greeting;

  const HomeHeader({
    super.key,
    required this.formattedDate,
    required this.greeting,
  });

  @override
  State<HomeHeader> createState() => _HomeHeaderState();
}

class _HomeHeaderState extends State<HomeHeader> {
  String _employeeName = '';

  @override
  void initState() {
    super.initState();
    _loadEmployeeProfile();
    NotificationService().refreshUnread();
  }

  Future<void> _loadEmployeeProfile() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;
    String name = '';
    try {
      final response = await Supabase.instance.client
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
      name = (response?['full_name'] ?? '').toString().trim();
    } catch (_) {
      // Dùng tên dự phòng bên dưới.
    }
    if (name.isEmpty) {
      name = (user.userMetadata?['full_name'] ?? '').toString().trim();
    }
    if (name.isEmpty) name = 'bạn';
    if (mounted) setState(() => _employeeName = name);
  }

  String get _initial {
    final n = _employeeName.trim();
    return n.isEmpty || n == 'bạn' ? '?' : String.fromCharCode(n.runes.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 12, 16, 8),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: 'Trang cá nhân',
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => Navigator.pushNamedAndRemoveUntil(context, AppRoutes.account_employee, (r) => false),
              child: Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Text(
                  _initial,
                  style: const TextStyle(color: AppColors.primary, fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.greeting,
                  style: AppText.caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _employeeName.isEmpty ? '...' : _employeeName,
                  style: AppText.h2.copyWith(fontSize: 20, fontWeight: FontWeight.w800),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Semantics(
            button: true,
            label: 'Thông báo',
            child: InkWell(
              onTap: () => Navigator.pushNamed(context, AppRoutes.notifications),
              customBorder: const CircleBorder(),
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border),
                ),
                child: ValueListenableBuilder<int>(
                  valueListenable: NotificationService.unreadCount,
                  builder: (_, n, __) => Badge(
                    isLabelVisible: n > 0,
                    label: Text(n > 99 ? '99+' : '$n'),
                    child: const Icon(Icons.notifications_none_rounded, color: AppColors.textPrimary),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
