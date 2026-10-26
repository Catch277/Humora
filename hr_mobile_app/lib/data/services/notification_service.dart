import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/app_notification.dart';
import 'api_error.dart';

class NotificationService {
  NotificationService({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const Duration _timeout = Duration(seconds: 20);

  /// Số thông báo chưa đọc, dùng cho chấm đỏ trên thanh điều hướng.
  static final ValueNotifier<int> unreadCount = ValueNotifier<int>(0);

  String get _uid {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw AppException('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
    return id;
  }

  Future<List<AppNotification>> list({bool unreadOnly = false}) async {
    try {
      var q = _client.from('notifications').select(AppNotification.columns).eq('user_id', _uid);
      if (unreadOnly) q = q.eq('is_read', false);
      final rows = await q.order('created_at', ascending: false).limit(100).timeout(_timeout);
      final items = (rows as List)
          .map((r) => AppNotification.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
      if (!unreadOnly) unreadCount.value = items.where((n) => !n.isRead).length;
      return items;
    } catch (e) {
      throw toAppException(e);
    }
  }

  /// Làm mới số chưa đọc; lỗi thì im lặng (chấm đỏ không đáng làm phiền người dùng).
  Future<void> refreshUnread() async {
    try {
      final rows = await _client
          .from('notifications')
          .select('id')
          .eq('user_id', _uid)
          .eq('is_read', false)
          .limit(100)
          .timeout(_timeout);
      unreadCount.value = (rows as List).length;
    } catch (_) {}
  }

  Future<void> markRead(String id) async {
    try {
      await _client
          .from('notifications')
          .update({'is_read': true})
          .eq('id', id)
          .eq('user_id', _uid)
          .timeout(_timeout);
    } catch (e) {
      throw toAppException(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _client
          .from('notifications')
          .update({'is_read': true})
          .eq('user_id', _uid)
          .eq('is_read', false)
          .timeout(_timeout);
      unreadCount.value = 0;
    } catch (e) {
      throw toAppException(e);
    }
  }
}
