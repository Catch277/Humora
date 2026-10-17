import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../widgets/widget_open_shift_registration.dart';

// ==================== 1. HEADER PROFILE ====================
class ScheduleHeaderCard extends StatelessWidget {
  const ScheduleHeaderCard({super.key});

  @override
  Widget build(BuildContext context) {
  return Container(
    padding: const EdgeInsets.all(16),
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        colors: [Color(0xFF1E50E6), Color(0xFF3B82F6)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      borderRadius: BorderRadius.only(
        bottomLeft: Radius.circular(24),
        bottomRight: Radius.circular(24),
      ),
    ),
    child: Column(
      children: [
        // Row top: Chỉ chứa duy nhất nút Back bên trái và Icon tìm kiếm/thông báo bên phải
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Nút Back duy nhất
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: _buildCircleIcon(Icons.arrow_back),
            ),
            Row(
              children: [
                _buildCircleIcon(Icons.search),
                const SizedBox(width: 8),
                Stack(
                  children: [
                    _buildCircleIcon(Icons.notifications_none),
                    Positioned(
                      right: 2,
                      top: 2,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Colors.redAccent,
                          shape: BoxShape.circle,
                        ),
                      ),
                    )
                  ],
                ),
              ],
            )
          ],
        ),
        
      ],
    ),
  );
}

  Widget _buildCircleIcon(IconData icon) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.2),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: Colors.white, size: 18),
    );
  }
}

// ==================== 2. OPEN SHIFT REGISTRATION BANNER ====================
class OpenShiftBanner extends StatelessWidget {
  const OpenShiftBanner({super.key});

  void _showOpenShiftRegistrationForm(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const OpenShiftFormModal(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => _showOpenShiftRegistrationForm(context),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.person_add_alt_1_outlined, color: Color(0xFF2563EB), size: 20),
            SizedBox(width: 8),
            Center(
              child: Text(
                'Tự đăng ký ca mở',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
            )
          ],
        ),
      ),
    );
  }
}

// ==================== 3. WEEK SELECTOR ====================
class WeekSelectorCard extends StatelessWidget {
  const WeekSelectorCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.chevron_left, color: Colors.grey),
          ),
          Column(
            children: [
              Row(
                children: const [
                  Icon(Icons.calendar_today_outlined, size: 16, color: Colors.black87),
                  SizedBox(width: 6),
                  Text(
                    '28/10 - 03/11/2024',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              const Text(
                'Quay lại tuần này',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.chevron_right, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}

// ==================== 4. SCHEDULE STATUS & ACTION CARD ====================
class ScheduleStatusCard extends StatelessWidget {
  const ScheduleStatusCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: const [
                        Icon(Icons.check_circle_outline, color: Color(0xFF10B981), size: 18),
                        SizedBox(width: 6),
                        Text(
                          'Quản lý đã chốt lịch',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.black87),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Duyệt bởi: Phạm Hoàng Bách\n(Director of Engineering)',
                      style: TextStyle(fontSize: 12, color: Colors.grey, height: 1.3),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: const [
                  Text(
                    '40h',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                  SizedBox(height: 2),
                  Text(
                    '10 ca tiêu chuẩn\n(2 ca/ngày)',
                    textAlign: TextAlign.end,
                    style: TextStyle(fontSize: 11, color: Colors.grey, height: 1.2),
                  ),
                ],
              )
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.swap_horiz, size: 18, color: Colors.black87),
                  label: const Text('Yêu cầu đổi ca', style: TextStyle(color: Colors.black87, fontSize: 13)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    side: BorderSide(color: Colors.grey.shade300),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.alarm_add, size: 18, color: Colors.black87),
                  label: const Text('Đăng ký tăng ca', style: TextStyle(color: Colors.black87, fontSize: 13)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    side: BorderSide(color: Colors.grey.shade300),
                  ),
                ),
              ),
            ],
          )
        ],
      ),
    );
  }
}

// ==================== 5. WEEKLY SCHEDULE TABLE ====================
class WeeklyScheduleTable extends StatelessWidget {
  const WeeklyScheduleTable({super.key});

  @override
  Widget build(BuildContext context) {
    
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: const [
            Icon(Icons.grid_view, color: Colors.grey, size: 20),
            Row(
              children: [
                Icon(Icons.swipe, color: Colors.grey, size: 16),
                SizedBox(width: 4),
                Text('Kéo ngang để xem đủ tuần', style: TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            )
          ],
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Container(
              color: Colors.white,
              child: Column(
                children: [
                  // Table Header
                  Container(
                    color: const Color(0xFF0F3A66),
                    child: Row(
                      children: [
                        _buildHeaderCell('Ca /\nKhung giờ', width: 80),
                        _buildHeaderCell('Thứ 2', width: 130),
                        _buildHeaderCell('Thứ 3', width: 130),
                        _buildHeaderCell('Thứ 4', width: 130),
                        _buildHeaderCell('Thứ 5', width: 130),
                      ],
                    ),
                  ),
                  // Row Ca Sáng
                  IntrinsicHeight(
                    child: Row(
                      children: [
                        _buildTimeCell('Ca Sáng\n(Ca 1)\n08:30\n-\n12:30\n4.0 Giờ', width: 80),
                        _buildShiftCell(
                          code: 'PROJ-DEV',
                          title: 'Phát triển Tính năng Mobile App',
                          location: 'Phòng Dev Tầng 4',
                          manager: 'Hoàng Minh Tuấn',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'SPRINT-MEET',
                          title: 'Họp Sprint Review & Kế hoạch',
                          location: 'Phòng Họp London',
                          manager: 'Nguyễn Bích Trâm',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'REMOTE-DEV',
                          title: 'Bảo trì Hệ thống Cloud & DevOps',
                          location: 'Làm việc từ xa (WFH)',
                          manager: 'Đỗ Quốc Huy',
                          type: ShiftType.remote,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'PROJ-DEV',
                          title: 'Phát triển Tính năng Mobile App',
                          location: 'Phòng Dev Tầng 4',
                          manager: 'Hoàng Minh Tuấn',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                      ],
                    ),
                  ),
                  // Row Nghỉ Trưa Divider
                  Container(
                    width: 80 + (130 * 4),
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
                    color: const Color(0xFFF8FAFC),
                    child: Row(
                      children: const [
                        Text('Nghỉ trưa', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        Spacer(),
                        Text('12:30 - 13:00 • Thời gian nghỉ', style: TextStyle(fontSize: 10, color: Colors.grey)),
                      ],
                    ),
                  ),
                  // Row Ca Chiều
                  IntrinsicHeight(
                    child: Row(
                      children: [
                        _buildTimeCell('Ca Chiều\n(Ca 2)\n13:00\n-\n17:00\n4.0 Giờ', width: 80),
                        _buildShiftCell(
                          code: 'TEST-API',
                          title: 'Kiểm thử API & Tích hợp Gateway',
                          location: 'Lab Kỹ thuật 2',
                          manager: 'Đặng Thúy Dương',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'BI-REPORT',
                          title: 'Báo cáo Dữ liệu & Hạ tầng Sprint',
                          location: 'Phòng Dev Tầng 4',
                          manager: 'Đỗ Quốc Huy',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'REMOTE-SEC',
                          title: 'Đồng bộ Kiến trúc Bảo mật (WFH)',
                          location: 'Làm việc từ xa (WFH)',
                          manager: 'Bùi Đình Trong',
                          type: ShiftType.remote,
                          width: 130,
                        ),
                        _buildShiftCell(
                          code: 'TEST-API',
                          title: 'Kiểm thử API & Tích hợp Gateway',
                          location: 'Lab Kỹ thuật 2',
                          manager: 'Đặng Thúy Dương',
                          type: ShiftType.standard,
                          width: 130,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeaderCell(String text, {required double width}) {
    return Container(
      width: width,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      alignment: Alignment.center,
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
      ),
    );
  }

  Widget _buildTimeCell(String text, {required double width}) {
    return Container(
      width: width,
      padding: const EdgeInsets.all(8),
      color: const Color(0xFFF8FAFC),
      child: Center(
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.black87, height: 1.3),
        ),
      ),
    );
  }

  Widget _buildShiftCell({
    required String code,
    required String title,
    required String location,
    required String manager,
    required ShiftType type,
    required double width,
  }) {
    Color borderColor = type == ShiftType.remote ? const Color(0xFF10B981) : const Color(0xFFF59E0B);
    Color textColor = type == ShiftType.remote ? const Color(0xFF047857) : const Color(0xFFD97706);

    return Container(
      width: width,
      margin: const EdgeInsets.all(4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor, width: 1, style: BorderStyle.solid),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            code,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: textColor),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.black87),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                type == ShiftType.remote ? Icons.home_outlined : Icons.location_on_outlined,
                size: 10,
                color: Colors.grey,
              ),
              const SizedBox(width: 2),
              Expanded(
                child: Text(
                  location,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 9, color: Colors.grey),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'QL: $manager',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 9, color: Color(0xFF2563EB)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

enum ShiftType { standard, remote }

// ==================== 6. SHIFT LEGEND ====================
class ShiftLegend extends StatelessWidget {
  const ShiftLegend({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _buildItem(const Color(0xFFF59E0B), 'Ca đã xếp (Tiêu chuẩn)')),
            Expanded(child: _buildItem(const Color(0xFF2563EB), 'Ca hôm nay (Đang trực)')),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _buildItem(const Color(0xFF10B981), 'Làm từ xa (WFH)')),
            Expanded(child: _buildItem(const Color(0xFFEF4444), 'Tăng ca (OT +1.5x)')),
          ],
        ),
      ],
    );
  }

  Widget _buildItem(Color color, String text) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            border: Border.all(color: color),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 11, color: Colors.black87),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

// ==================== 7. BOTTOM FOOTER BUTTONS ====================
class ScheduleFooterButtons extends StatelessWidget {
  const ScheduleFooterButtons({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.02),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(Icons.swap_horizontal_circle_outlined, color: Colors.black87, size: 20),
                SizedBox(width: 8),
                Text(
                  'Đổi ca đồng nghiệp',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.02),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(Icons.send_outlined, color: Colors.black87, size: 18),
                SizedBox(width: 8),
                Text(
                  'Gửi phiếu đăng ký',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}