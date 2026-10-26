import 'package:flutter/material.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/app_widgets.dart';
import '../../data/models/app_notification.dart';
import '../../data/services/notification_service.dart';
import '../../routes/app_routers.dart';
import '../../widgets/bottom_nav_bar.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final NotificationService _service = NotificationService();
  bool _loading = true;
  bool _unreadOnly = false;
  String? _error;
  List<AppNotification> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _service.list(unreadOnly: _unreadOnly);
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _markAll() async {
    try {
      await _service.markAllRead();
      await _load();
    } catch (e) {
      if (mounted) showAppSnack(context, e.toString(), error: true);
    }
  }

  Future<void> _open(AppNotification n) async {
    if (!n.isRead) {
      setState(() {
        _items = _items.map((x) => x.id == n.id ? x.copyWith(isRead: true) : x).toList();
      });
      try {
        await _service.markRead(n.id);
        _service.refreshUnread();
      } catch (_) {
        // Không đánh dấu được cũng không sao, lần sau tải lại sẽ đúng.
      }
    }
    if (!mounted) return;
    if (n.type.startsWith('payslip')) {
      Navigator.pushNamed(context, AppRoutes.payslips);
    } else if (n.type.contains('attendance')) {
      Navigator.pushNamed(context, AppRoutes.timesheet);
    } else if (n.type.contains('request')) {
      Navigator.pushNamed(context, AppRoutes.leave_request_employee);
    } else if (n.type.contains('shift')) {
      Navigator.pushNamed(context, AppRoutes.work_schedule_employee);
    }
  }

  IconData _icon(String type) {
    if (type.startsWith('payslip')) return Icons.payments_outlined;
    if (type.contains('attendance')) return Icons.fingerprint_rounded;
    if (type.contains('request')) return Icons.assignment_turned_in_outlined;
    if (type.contains('shift')) return Icons.calendar_month_outlined;
    return Icons.notifications_none_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _items.any((n) => !n.isRead);
    return AppPage(
      title: 'Thông báo',
      showBack: false,
      trailing: TextButton(
        onPressed: hasUnread ? _markAll : null,
        child: const Text('Đọc tất cả'),
      ),
      onRefresh: _load,
      bottomNavigationBar: const BottomNavBar(currentIndex: 3),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('Tất cả'),
                  selected: !_unreadOnly,
                  onSelected: (_) {
                    setState(() => _unreadOnly = false);
                    _load();
                  },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Chưa đọc'),
                  selected: _unreadOnly,
                  onSelected: (_) {
                    setState(() => _unreadOnly = true);
                    _load();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              builder: (_) => _items.isEmpty
                  ? const EmptyState(
                      icon: Icons.notifications_off_outlined,
                      title: 'Chưa có thông báo',
                      message: 'Thông báo về ca làm, đơn từ và lương sẽ hiện ở đây.',
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: _items.length,
                      itemBuilder: (_, i) => _tile(_items[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(AppNotification n) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => _open(n),
      color: n.isRead ? AppColors.surface : AppColors.primarySoft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: n.isRead ? AppColors.surfaceMuted : AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: Icon(_icon(n.type), size: 20, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  n.title,
                  style: AppText.title.copyWith(fontWeight: n.isRead ? FontWeight.w600 : FontWeight.w800),
                ),
                if (n.body.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(n.body, style: AppText.bodyMuted, maxLines: 3, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 6),
                Text(timeAgo(n.createdAt), style: AppText.caption),
              ],
            ),
          ),
          if (!n.isRead)
            Container(
              margin: const EdgeInsets.only(top: 6, left: 8),
              width: 9,
              height: 9,
              decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
            ),
        ],
      ),
    );
  }
}
