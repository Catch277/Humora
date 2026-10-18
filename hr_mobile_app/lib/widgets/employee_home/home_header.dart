import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../main.dart'; // Nơi chứa themeNotifier

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
  String _employeeName = 'Đang tải...';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadEmployeeProfile();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Lấy tên nhân viên đăng nhập thực tế từ bảng 'users' trong Supabase
  Future<void> _loadEmployeeProfile() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      try {
        // 1. Truy vấn trực tiếp cột 'full_name' từ bảng 'users' theo ID đăng nhập
        final response = await Supabase.instance.client
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();

        if (response != null &&
            response['full_name'] != null &&
            response['full_name'].toString().trim().isNotEmpty) {
          if (mounted) {
            setState(() {
              _employeeName = response['full_name'].toString().trim();
            });
          }
          return;
        }

        // 2. Fallback: Lấy từ User Metadata nếu bảng users chưa có full_name
        final metaName = user.userMetadata?['full_name'];
        if (metaName != null && metaName.toString().trim().isNotEmpty) {
          if (mounted) {
            setState(() {
              _employeeName = metaName.toString().trim();
            });
          }
        } else {
          if (mounted) {
            setState(() {
              _employeeName = 'Nhân viên';
            });
          }
        }
      } catch (e) {
        debugPrint('Lỗi tải full_name từ bảng users: $e');
        if (mounted) {
          setState(() {
            _employeeName = 'Nhân viên';
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.transparent,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ================= 1. HÀNG TRÊN: AVATAR + CHÀO TƯƠNG ỨNG (LẤY FULL_NAME) & NÚT SÁNG TỐI =================
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Khung Capsule trong suốt chứa Avatar + Lời chào theo thời gian & Full_Name
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(30),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.3),
                    width: 1,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircleAvatar(
                      radius: 20,
                      backgroundImage: AssetImage('assets/images/avt.png'),
                    ),
                    const SizedBox(width: 10),
                    // Hiển thị Lời chào tương ứng + full_name thật từ bảng users
                    Text(
                      '${widget.greeting}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                ),
              ),

              // Nút tròn trong suốt thay đổi Sáng / Tối hệ thống
              ValueListenableBuilder<ThemeMode>(
                valueListenable: themeNotifier,
                builder: (context, currentMode, child) {
                  final isDark = currentMode == ThemeMode.dark;
                  return GestureDetector(
                    onTap: () {
                      themeNotifier.value = isDark ? ThemeMode.light : ThemeMode.dark;
                    },
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.18),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withOpacity(0.3),
                          width: 1,
                        ),
                      ),
                      child: Icon(
                        isDark ? Icons.wb_sunny_outlined : Icons.nightlight_round,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 24),

          // ================= 2. HÀNG GIỮA: NGÀY THÁNG & LỜI CHÀO KÈM TÊN NHÂN VIÊN =================
          Text(
            widget.formattedDate,
            style: TextStyle(
              color: Colors.white.withOpacity(0.85),
              fontSize: 14,
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 4),

          // Dòng tiêu đề lớn hiển thị tên nhân viên
          Text(
            'Hey, $_employeeName !',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.3,
            ),
          ),

          const SizedBox(height: 20),

          // ================= 3. HÀNG DƯỚI: THANH TÌM KIẾM KHUÔN GLASSMORPHISM =================
          Row(
            children: [
              // Ô Tìm kiếm
              Expanded(
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(26),
                    border: Border.all(
                      color: Colors.white.withOpacity(0.35),
                      width: 1.2,
                    ),
                  ),
                  child: TextField(
                    controller: _searchController,
                    style: const TextStyle(color: Colors.white, fontSize: 15),
                    decoration: InputDecoration(
                      hintText: 'Search...',
                      hintStyle: TextStyle(
                        color: Colors.white.withOpacity(0.7),
                        fontSize: 15,
                      ),
                      prefixIcon: Icon(
                        Icons.search,
                        color: Colors.white.withOpacity(0.8),
                        size: 22,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(width: 12),

              // Nút Filter
              GestureDetector(
                onTap: () {
                  // Xử lý khi nhấn nút Lọc (Filter)
                },
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black12,
                        blurRadius: 10,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.tune_rounded,
                    color: Colors.black87,
                    size: 22,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}