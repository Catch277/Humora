import 'package:flutter/material.dart';
import '../../routes/app_routers.dart';

class HrServicesGrid extends StatelessWidget {
  const HrServicesGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16), // Padding bên trong khung trắng
        decoration: BoxDecoration(
          color: Colors.white, // Nền màu trắng
          borderRadius: BorderRadius.circular(20), // Bo góc mềm mại
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03), // Bóng mờ nhẹ
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. Tiêu đề danh mục Dịch Vụ Nhân Sự
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Dịch vụ nhân sự',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                GestureDetector(
                  onTap: () {},
                  child: Row(
                    children: const [
                      Text(
                        'Tất cả (6)',
                        style: TextStyle(
                          color: Color(0xFF2563EB),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: Color(0xFF2563EB)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // 2. Lưới cố định 2 hàng x 3 cột
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(), // Cố định khung không cho cuộn
              crossAxisCount: 3, // 3 cột
              crossAxisSpacing: 8, // Khoảng cách giữa các cột
              mainAxisSpacing: 10, // Khoảng cách giữa các hàng
              childAspectRatio: 1.8, // Tỷ lệ chiều rộng/cao tối ưu hiển thị trọn vẹn chữ
              children: [
                _buildCircleServiceItem(
                  context: context,
                  title: 'Lịch làm việc',
                  icon: Icons.calendar_today_outlined,
                  iconColor: const Color(0xFF2563EB),
                  bgColor: const Color(0xFFEFF6FF),
                  onTap: () {
                    Navigator.pushNamed(context, AppRoutes.work_schedule_employee);
                  },
                ),
                _buildCircleServiceItem(
                  context: context,
                  title: 'Nghỉ phép',
                  icon: Icons.assignment_turned_in_outlined,
                  iconColor: const Color(0xFF10B981),
                  bgColor: const Color(0xFFECFDF5),
                  onTap: () {
                    Navigator.pushNamed(context, AppRoutes.leave_request_employee);
                  },
                ),
                _buildCircleServiceItem(
                  context: context,
                  title: 'Phiếu lương',
                  icon: Icons.subtitles_outlined,
                  iconColor: const Color(0xFFD97706),
                  bgColor: const Color(0xFFFEF3C7),
                  onTap: () {},
                ),
                _buildCircleServiceItem(
                  context: context,
                  title: 'Bảng công',
                  icon: Icons.assignment_outlined,
                  iconColor: const Color(0xFF6366F1),
                  bgColor: const Color(0xFFEEF2FF),
                  onTap: () {},
                ),
                _buildCircleServiceItem(
                  context: context,
                  title: 'Đăng ký OT',
                  icon: Icons.more_time_outlined,
                  iconColor: const Color(0xFFA855F7),
                  bgColor: const Color(0xFFF3E8FF),
                  onTap: () {},
                ),
                _buildCircleServiceItem(
                  context: context,
                  title: 'Phúc lợi',
                  icon: Icons.favorite_border_outlined,
                  iconColor: const Color(0xFFEC4899),
                  bgColor: const Color(0xFFFCE7F3),
                  onTap: () {
                    Navigator.pushNamed(context, AppRoutes.policy_benefits);
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // Widget ô khung hình tròn + nét icon mảnh & mịn
  Widget _buildCircleServiceItem({
    required BuildContext context,
    required String title,
    required IconData icon,
    required Color iconColor,
    required Color bgColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Khung tròn chứa Icon nét mảnh
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: bgColor,
                shape: BoxShape.circle,
                border: Border.all(
                  color: iconColor.withOpacity(0.18),
                  width: 1,
                ),
              ),
              child: Icon(
                icon,
                color: iconColor,
                size: 22,
              ),
            ),
            const SizedBox(height: 6),

            // Tên dịch vụ hiển thị trọn vẹn
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.black87,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}