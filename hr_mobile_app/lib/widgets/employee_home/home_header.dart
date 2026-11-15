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
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 2),
      padding: EdgeInsets.fromLTRB(14, MediaQuery.of(context).padding.top + 14, 14, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF172B50), Color(0xFF101A2D), Color(0xFF101827)],
        ),
        border: Border.all(color: context.pal.borderStrong.withValues(alpha: .75)),
        boxShadow: [
          BoxShadow(color: context.pal.primary.withValues(alpha: .10), blurRadius: 24, offset: const Offset(0, 8)),
          BoxShadow(color: Colors.black.withValues(alpha: .16), blurRadius: 18, offset: const Offset(0, 7)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Semantics(
                button: true, label: 'Trang cá nhân',
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => Navigator.pushNamedAndRemoveUntil(context, AppRoutes.account_employee, (r) => false),
                  child: Container(
                    width: 54, height: 54,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [Color(0xFF73A0FF), Color(0xFF3159D9)]),
                      border: Border.all(color: const Color(0xFFB8CCFF), width: 1.4),
                      boxShadow: [BoxShadow(color: context.pal.primary.withValues(alpha: .25), blurRadius: 16, offset: const Offset(0, 4))],
                    ),
                    alignment: Alignment.center,
                    child: Text(_initial, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(widget.greeting, style: const TextStyle(color: Color(0xFFA9C3F8), fontSize: 12, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 3),
                  Text(_employeeName.isEmpty ? 'Đang tải...' : _employeeName,
                    style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -.3),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                ]),
              ),
              Semantics(
                button: true, label: 'Thông báo',
                child: Material(
                  color: const Color(0xFF243858), shape: const CircleBorder(),
                  child: InkWell(
                    onTap: () => Navigator.pushNamed(context, AppRoutes.notifications),
                    customBorder: const CircleBorder(),
                    child: SizedBox(width: 48, height: 48, child: Center(
                      child: ValueListenableBuilder<int>(
                        valueListenable: NotificationService.unreadCount,
                        builder: (_, n, __) => Badge(
                          isLabelVisible: n > 0, label: Text(n > 99 ? '99+' : '$n'),
                          child: const Icon(Icons.notifications_active_rounded, color: Color(0xFFDCE7FF), size: 23),
                        ),
                      ),
                    )),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .055), borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: .08))),
            child: Row(children: [
              const Icon(Icons.calendar_today_rounded, color: Color(0xFF83A8FF), size: 15),
              const SizedBox(width: 8),
              Expanded(child: Text(widget.formattedDate, style: const TextStyle(color: Color(0xFFCFD9EC), fontSize: 12, fontWeight: FontWeight.w700))),
              Container(width: 7, height: 7, decoration: BoxDecoration(color: context.pal.success, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text('TRỰC TUYẾN', style: TextStyle(color: context.pal.success, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: .7)),
            ]),
          ),
        ],
      ),
    );
  }
}