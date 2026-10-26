import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/app_colors.dart';
import '../../core/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Khoá bảo vệ số tiền: trước khi xem thu nhập, nhân viên phải nhập lại mật khẩu đăng nhập.
/// Trạng thái "đã mở khoá" chỉ nằm trong bộ nhớ, tự hết hạn sau 5 phút và bị xoá khi đăng xuất.
/// Đây là lớp bảo vệ bổ sung (người khác cầm máy đang mở sẵn app); quyền truy cập thật do RLS quyết định.
class PayrollGate {
  PayrollGate._();

  static DateTime? _unlockedAt;
  static const Duration _ttl = Duration(minutes: 5);

  static bool get isUnlocked =>
      _unlockedAt != null && DateTime.now().difference(_unlockedAt!) < _ttl;

  static void lock() => _unlockedAt = null;

  /// Trả về true nếu đã (hoặc vừa) được mở khoá.
  static Future<bool> ensureUnlocked(BuildContext context) async {
    if (isUnlocked) return true;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _UnlockSheet(),
    );
    if (ok == true) {
      _unlockedAt = DateTime.now();
      return true;
    }
    return false;
  }
}

class _UnlockSheet extends StatefulWidget {
  const _UnlockSheet();

  @override
  State<_UnlockSheet> createState() => _UnlockSheetState();
}

class _UnlockSheetState extends State<_UnlockSheet> {
  final TextEditingController _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;
  int _failures = 0;
  DateTime? _lockedUntil;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final now = DateTime.now();
    if (_lockedUntil != null && now.isBefore(_lockedUntil!)) {
      final secs = _lockedUntil!.difference(now).inSeconds + 1;
      setState(() => _error = 'Thử sai nhiều lần. Vui lòng đợi $secs giây.');
      return;
    }

    final pwd = _password.text;
    if (pwd.isEmpty) {
      setState(() => _error = 'Hãy nhập mật khẩu.');
      return;
    }

    final client = Supabase.instance.client;
    final email = client.auth.currentUser?.email;
    if (email == null) {
      // Tài khoản không có email thì không có gì để xác minh lại.
      if (mounted) Navigator.pop(context, true);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await client.auth.signInWithPassword(email: email, password: pwd);
      if (!mounted) return;
      Navigator.pop(context, true);
    } on AuthException {
      _failures++;
      if (_failures >= 5) {
        _lockedUntil = DateTime.now().add(const Duration(seconds: 30));
        _failures = 0;
      }
      if (mounted) {
        setState(() => _error = 'Mật khẩu chưa đúng.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Không kết nối được máy chủ. Thử lại sau.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(
        24,
        14,
        24,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: AppColors.primarySoft,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.lock_outline_rounded, color: AppColors.primary),
            ),
            const SizedBox(height: 14),
            const Text('Xác nhận để xem thu nhập', style: AppText.h2),
            const SizedBox(height: 6),
            const Text(
              'Thông tin lương rất nhạy cảm. Nhập lại mật khẩu đăng nhập để tiếp tục. '
              'Phiên xem sẽ tự khoá sau 5 phút.',
              style: AppText.bodyMuted,
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _password,
              obscureText: _obscure,
              autofocus: true,
              enableSuggestions: false,
              autocorrect: false,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Mật khẩu',
                errorText: _error,
                filled: true,
                fillColor: AppColors.surfaceMuted,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  tooltip: _obscure ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
                ),
              ),
            ),
            const SizedBox(height: 18),
            PrimaryButton(label: 'Mở khoá', icon: Icons.lock_open_rounded, busy: _busy, onPressed: _submit),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context, false),
                child: const Text('Để sau'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
