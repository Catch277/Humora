import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/app_colors.dart';
import '../core/app_theme.dart';
import '../core/widgets/app_widgets.dart';
import '../features/payroll/payroll_gate.dart';
import '../routes/app_routers.dart';
import '../widgets/bottom_nav_bar.dart';

class AccountEmployeeScreen extends StatefulWidget {
  const AccountEmployeeScreen({super.key});

  @override
  State<AccountEmployeeScreen> createState() => _AccountEmployeeScreenState();
}

class _AccountEmployeeScreenState extends State<AccountEmployeeScreen> {
  String _name = '';
  String _role = '';
  String _org = '';
  String _branch = '';
  String _email = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      setState(() => _loading = false);
      return;
    }
    String name = '';
    String role = '';
    String org = '';
    String branch = '';
    try {
      final u = await client
          .from('users')
          .select('full_name, role, organization_id, branch_id')
          .eq('id', user.id)
          .maybeSingle();
      name = (u?['full_name'] ?? '').toString().trim();
      role = (u?['role'] ?? '').toString().toUpperCase();
      if (u?['organization_id'] != null) {
        final o = await client
            .from('organizations')
            .select('name')
            .eq('id', u!['organization_id'])
            .maybeSingle();
        org = (o?['name'] ?? '').toString();
      }
      if (u?['branch_id'] != null) {
        final b = await client
            .from('branches')
            .select('name')
            .eq('id', u!['branch_id'])
            .maybeSingle();
        branch = (b?['name'] ?? '').toString();
      }
    } catch (_) {
      // Giữ giá trị dự phòng.
    }
    if (name.isEmpty) name = (user.userMetadata?['full_name'] ?? 'Chưa cập nhật tên').toString();
    if (!mounted) return;
    setState(() {
      _name = name;
      _role = role;
      _org = org;
      _branch = branch;
      _email = user.email ?? '';
      _loading = false;
    });
  }

  String get _roleLabel {
    switch (_role) {
      case 'MANAGER':
        return 'Quản lý chi nhánh';
      case 'OWNER':
        return 'Chủ sở hữu';
      default:
        return 'Nhân viên';
    }
  }

  Future<void> _changePassword() async {
    final newPassword = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _PasswordSheet(),
    );
    if (newPassword == null || !mounted) return;
    try {
      final client = Supabase.instance.client;
      await client.auth.updateUser(UserAttributes(password: newPassword));
      try {
        await client.rpc('complete_password_change');
      } catch (_) {
        // Hàm này chỉ có ở bản web mới; bỏ qua nếu chưa cài.
      }
      if (mounted) showAppSnack(context, 'Đã đổi mật khẩu.');
    } on AuthException catch (e) {
      if (mounted) {
        final weak = e.message.toLowerCase().contains('password');
        showAppSnack(context, weak ? 'Mật khẩu chưa đạt yêu cầu hoặc trùng mật khẩu cũ.' : 'Không đổi được mật khẩu.',
            error: true);
      }
    } catch (_) {
      if (mounted) showAppSnack(context, 'Không đổi được mật khẩu. Thử lại sau.', error: true);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: const Text('Bạn sẽ cần đăng nhập lại để dùng ứng dụng.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Đăng xuất', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    PayrollGate.lock();
    try {
      await Supabase.instance.client.auth.signOut();
    } catch (_) {
      // Dù lỗi mạng, vẫn về màn hình đăng nhập; phiên cục bộ đã bị xoá.
    }
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil(AppRoutes.login, (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Tài khoản',
      showBack: false,
      bottomNavigationBar: const BottomNavBar(currentIndex: 3),
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        children: [
          _profile(),
          const SizedBox(height: 20),
          const SectionTitle('Của tôi'),
          _menu([
            _Item('Phiếu lương', 'Thu nhập và phiếu lương hằng tháng', Icons.receipt_long_outlined,
                () => Navigator.pushNamed(context, AppRoutes.payslips)),
            _Item('Bảng công', 'Giờ vào/ra và khiếu nại', Icons.fact_check_outlined,
                () => Navigator.pushNamed(context, AppRoutes.timesheet)),
            _Item('Đơn nghỉ phép', 'Tạo và theo dõi đơn', Icons.event_busy_outlined,
                () => Navigator.pushNamed(context, AppRoutes.leave_request_employee)),
            _Item('Quy chế & phúc lợi', 'Chính sách của công ty', Icons.favorite_border_rounded,
                () => Navigator.pushNamed(context, AppRoutes.policy_benefits)),
          ]),
          const SizedBox(height: 20),
          const SectionTitle('Bảo mật'),
          _menu([
            _Item('Đổi mật khẩu', 'Nên đổi định kỳ, không chia sẻ cho ai', Icons.lock_outline_rounded, _changePassword),
          ]),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('Đăng xuất'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.dangerSoft, width: 1.5),
                backgroundColor: AppColors.dangerSoft,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _profile() {
    final initial = _name.isEmpty ? '?' : String.fromCharCode(_name.runes.first).toUpperCase();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryStrong],
        ),
      ),
      child: _loading
          ? const SizedBox(height: 72, child: Center(child: CircularProgressIndicator(color: Colors.white)))
          : Row(
              children: [
                Container(
                  width: 62,
                  height: 62,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Text(initial,
                      style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_name,
                          style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(_roleLabel, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                      if (_branch.isNotEmpty || _org.isNotEmpty)
                        Text(
                          [if (_branch.isNotEmpty) _branch, if (_org.isNotEmpty) _org].join(' • '),
                          style: const TextStyle(color: Colors.white70, fontSize: 12.5),
                        ),
                      if (_email.isNotEmpty)
                        Text(_email, style: const TextStyle(color: Colors.white60, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _menu(List<_Item> items) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 62, color: AppColors.border),
            ListTile(
              onTap: items[i].onTap,
              leading: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                child: Icon(items[i].icon, color: AppColors.primary, size: 20),
              ),
              title: Text(items[i].title, style: AppText.title),
              subtitle: Text(items[i].subtitle, style: AppText.caption),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}

class _Item {
  _Item(this.title, this.subtitle, this.icon, this.onTap);
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;
}

class _PasswordSheet extends StatefulWidget {
  const _PasswordSheet();

  @override
  State<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends State<_PasswordSheet> {
  final TextEditingController _a = TextEditingController();
  final TextEditingController _b = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _a.dispose();
    _b.dispose();
    super.dispose();
  }

  void _submit() {
    if (_a.text.length < 8) {
      setState(() => _error = 'Mật khẩu cần ít nhất 8 ký tự.');
      return;
    }
    if (_a.text != _b.text) {
      setState(() => _error = 'Hai mật khẩu chưa khớp.');
      return;
    }
    Navigator.pop(context, _a.text);
  }

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        filled: true,
        fillColor: AppColors.surfaceMuted,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Đổi mật khẩu', style: AppText.h2),
            const SizedBox(height: 14),
            TextField(controller: _a, obscureText: true, decoration: _dec('Mật khẩu mới')),
            const SizedBox(height: 10),
            TextField(controller: _b, obscureText: true, decoration: _dec('Nhập lại mật khẩu mới')),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              ),
            const SizedBox(height: 14),
            PrimaryButton(label: 'Cập nhật mật khẩu', onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
