import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/services/notification_service.dart';
import '../../routes/app_routers.dart';

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
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 40),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0C66E4), Color(0xFF1D4ED8)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
            ),
            alignment: Alignment.center,
            child: Text(
              _initial,
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.greeting} • ${widget.formattedDate}',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  _employeeName.isEmpty ? '...' : _employeeName,
                  style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          InkWell(
            onTap: () => Navigator.pushNamed(context, AppRoutes.notifications),
            customBorder: const CircleBorder(),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                shape: BoxShape.circle,
              ),
              child: ValueListenableBuilder<int>(
                valueListenable: NotificationService.unreadCount,
                builder: (_, n, __) => Badge(
                  isLabelVisible: n > 0,
                  label: Text(n > 99 ? '99+' : '$n'),
                  child: const Icon(Icons.notifications_none_rounded, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
