import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/open_shift_registration_model.dart';

// ==================== 1. MODAL FORM ĐĂNG KÝ CA MỜ (GIAO DIỆN NHƯ ẢNH 1) ====================
class OpenShiftFormModal extends StatefulWidget {
  final Function(OpenShiftRegistrationModel)? onShiftRegistered;

  const OpenShiftFormModal({super.key, this.onShiftRegistered});

  @override
  State<OpenShiftFormModal> createState() => _OpenShiftFormModalState();
}

class _OpenShiftFormModalState extends State<OpenShiftFormModal> {
  String _selectedDay = 'Thứ 2';
  String _selectedShiftName = 'Ca sáng';
  String _selectedShiftTime = '08:30 - 12:30';
  
  String _fullName = 'Đang tải...';
  String _role = 'Nhân viên';
  bool _isLoadingUser = true;

  final List<String> _days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  final Map<String, String> _shiftTimes = {
    'Ca sáng': '08:30 - 12:30',
    'Ca chiều': '13:00 - 17:00',
  };

  @override
  void initState() {
    super.initState();
    _fetchUserInfo();
  }

  // Lấy thông tin user đăng nhập từ Supabase
  Future<void> _fetchUserInfo() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      try {
        final response = await Supabase.instance.client
            .from('users')
            .select('full_name, role')
            .eq('id', user.id)
            .maybeSingle();

        if (response != null && mounted) {
          setState(() {
            _fullName = response['full_name'] ?? 'Chưa cập nhật tên';
            _role = response['role'] ?? 'Nhân viên';
            _isLoadingUser = false;
          });
        }
      } catch (e) {
        if (mounted) {
          setState(() {
            _fullName = user.email?.split('@').first ?? 'Nhân viên';
            _isLoadingUser = false;
          });
        }
      }
    } else {
      if (mounted) {
        setState(() {
          _fullName = 'Nguyễn Văn An';
          _role = 'Software Engineer';
          _isLoadingUser = false;
        });
      }
    }
  }

  void _submitRegistration() {
    final registration = OpenShiftRegistrationModel(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      dayOfWeek: _selectedDay,
      dateStr: DateTime.now().toString().split(' ')[0],
      shiftName: _selectedShiftName,
      shiftTime: _selectedShiftTime,
      employeeName: _fullName,
      employeeRole: _role,
    );

    if (widget.onShiftRegistered != null) {
      widget.onShiftRegistered!(registration);
    }

    Navigator.pop(context);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã đăng ký $_selectedShiftName ($_selectedShiftTime) cho $_selectedDay thành công!'),
        backgroundColor: const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Thanh kéo modal
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Title & Close Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: const [
                  Icon(Icons.edit_calendar_outlined, color: Color(0xFF2563EB), size: 22),
                  SizedBox(width: 8),
                  Text(
                    'Đăng Ký Ca Mở',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                ],
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close, color: Colors.grey),
              ),
            ],
          ),
          const Divider(),
          const SizedBox(height: 12),

          // Hiển thị thông tin nhân viên đăng ký
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFF59E0B)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: const Color(0xFFF59E0B),
                  radius: 18,
                  child: Text(
                    _fullName.isNotEmpty ? _fullName[0].toUpperCase() : 'U',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isLoadingUser ? 'Đang tải thông tin...' : _fullName,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.black87),
                      ),
                      Text(
                        _role,
                        style: const TextStyle(fontSize: 11, color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Chọn ngày làm việc
          const Text('Chọn ngày trong tuần:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _selectedDay,
            decoration: InputDecoration(
              filled: true,
              fillColor: const Color(0xFFF8FAFC),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
            ),
            items: _days.map((day) => DropdownMenuItem(value: day, child: Text(day))).toList(),
            onChanged: (val) => setState(() => _selectedDay = val!),
          ),
          const SizedBox(height: 16),

          // Chọn ca làm việc
          const Text('Chọn ca làm việc:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _selectedShiftName,
            decoration: InputDecoration(
              filled: true,
              fillColor: const Color(0xFFF8FAFC),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
            ),
            items: _shiftTimes.keys.map((shiftKey) {
              return DropdownMenuItem(
                value: shiftKey,
                child: Text('$shiftKey (${_shiftTimes[shiftKey]})'),
              );
            }).toList(),
            onChanged: (val) {
              setState(() {
                _selectedShiftName = val!;
                _selectedShiftTime = _shiftTimes[val]!;
              });
            },
          ),
          const SizedBox(height: 24),

          // Nút bấm xác nhận
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E50E6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _submitRegistration,
              child: const Text('Xác nhận đăng ký ca', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== 2. THẺ CA VÀNG KHI ĐƯỢC CHỌN THÊM ====================
class OpenShiftSelectedCell extends StatelessWidget {
  final String fullName;
  final String role;
  final String shiftTime;
  final VoidCallback onTap;

  const OpenShiftSelectedCell({
    super.key,
    required this.fullName,
    required this.role,
    required this.shiftTime,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.all(4),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF3C7), // Màu nền vàng nghệ sáng
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: const BoxDecoration(
                color: Color(0xFFF59E0B),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  fullName.isNotEmpty ? fullName[0].toUpperCase() : 'U',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              fullName,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.black87),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              role,
              style: const TextStyle(fontSize: 9, color: Colors.black54),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              shiftTime,
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFFD97706)),
            ),
          ],
        ),
      ),
    );
  }
}