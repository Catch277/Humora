import 'package:flutter/material.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/widget_account_employee.dart';
import 'login_screen.dart';

class AccountEmployeeScreen extends StatefulWidget {
  const AccountEmployeeScreen({super.key});

  @override
  State<AccountEmployeeScreen> createState() => _AccountEmployeeScreenState();
}

class _AccountEmployeeScreenState extends State<AccountEmployeeScreen> {
  int _selectedIndex = 4; // Tab Tài khoản mặc định
  bool _isReminderEnabled = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FC),
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              // 1. App Bar
              const AccountAppBar(),
              const SizedBox(height: 10),

              // 2. Profile Card
              const ProfileCard(),
              const SizedBox(height: 16),

              // 3. Stats Row
              const StatCards(),
              const SizedBox(height: 16),

              // 4. Work Info Card
              const WorkInfoCard(),
              const SizedBox(height: 20),

              // 5. Section: Hồ sơ & Đãi ngộ nhân sự
              HrMenuSection(
                title: 'Hồ sơ & Đãi ngộ nhân sự',
                items: [
                  MenuItemData(
                    title: 'Thông tin cá nhân & Giấy tờ',
                    subtitle: 'CCCD gắn chip, địa chỉ thường trú, liên hệ kh...',
                    icon: Icons.badge_outlined,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                  ),
                  MenuItemData(
                    title: 'Hợp đồng & Phụ lục lương',
                    subtitle: '3 tài liệu đã ký số điện tử (Kèm quyết định tăn...',
                    icon: Icons.assignment_outlined,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                  ),
                  MenuItemData(
                    title: 'Tài khoản nhận lương',
                    subtitle: 'Techcombank •••• 6868 (Chi nhánh Đông Đô)',
                    icon: Icons.account_balance_outlined,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                  ),
                  MenuItemData(
                    title: 'Bảo hiểm & Phúc lợi cao cấp',
                    subtitle: 'BHXH Bắt buộc, Thẻ sức khỏe CarePlus VIP ...',
                    icon: Icons.health_and_safety_outlined,
                    iconColor: const Color(0xFF10B981),
                    bgColor: const Color(0xFFECFDF5),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 6. Section: Chấm công & Bảo mật thiết bị
              HrMenuSection(
                title: 'Chấm công & Bảo mật thiết bị',
                items: [
                  MenuItemData(
                    title: 'iPhone 15 Pro',
                    subtitle: 'Thiết bị duy nhất liên kết chấm công ...',
                    icon: Icons.phone_iphone,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                    badgeText: 'Đã khóa',
                    trailingWidget: OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text('Đổi máy', style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  MenuItemData(
                    title: 'Mã PIN phiếu lương (e-Payslip)',
                    subtitle: 'Mật mã riêng tư 6 số bảo vệ xem thu nhập',
                    icon: Icons.password,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 7. Section: Cài đặt ứng dụng & Trợ giúp
              HrMenuSection(
                title: 'Cài đặt ứng dụng & Trợ giúp',
                items: [
                  MenuItemData(
                    title: 'Nhắc nhở chấm công',
                    subtitle: 'Báo trước 10 phút giờ vào/ra ca làm',
                    icon: Icons.notifications_active_outlined,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                    trailingWidget: Switch(
                      value: _isReminderEnabled,
                      activeColor: const Color(0xFF2563EB),
                      onChanged: (val) {
                        setState(() {
                          _isReminderEnabled = val;
                        });
                      },
                    ),
                  ),
                  MenuItemData(
                    title: 'Trung tâm trợ giúp & Liên hệ HR',
                    subtitle: 'Hỏi đáp quy chế làm việc, gửi phiếu hỗ trợ',
                    icon: Icons.support_agent_outlined,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                  ),
                  MenuItemData(
                    title: 'Ngôn ngữ hiển thị',
                    subtitle: 'Tiếng Việt (Mặc định hệ thống)',
                    icon: Icons.translate,
                    iconColor: const Color(0xFF2563EB),
                    bgColor: const Color(0xFFEFF6FF),
                    trailingWidget: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Text('VI', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF2563EB))),
                        SizedBox(width: 4),
                        Icon(Icons.chevron_right, size: 18, color: Colors.grey),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // 8. Nút đăng xuất
              LogoutButton(
                onLogout: () {
                  Navigator.of(context).pushReplacementNamed('/login'); // Điều hướng đến màn hình đăng nhập
                },
              ),
              const SizedBox(height: 30),
            ],
          ),
        ),
      ),

      // Thanh Bottom Navigation
      bottomNavigationBar: BottomNavBar(
        currentIndex: 3,
      ),
    );
  }
}