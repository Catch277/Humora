import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/create_leave_request.dart'; // Import màn hình tạo đơn

class LeaveRequestEmployeeScreen extends StatefulWidget {
  const LeaveRequestEmployeeScreen({super.key});

  @override
  State<LeaveRequestEmployeeScreen> createState() =>
      _LeaveRequestEmployeeScreenState();
}

class _LeaveRequestEmployeeScreenState
    extends State<LeaveRequestEmployeeScreen> {
  int _selectedFilterIndex = 0;

  // Danh sách đơn nghỉ phép đọc từ Supabase (bảng requests)
  List<Map<String, dynamic>> _leaveRequests = [];
  bool _loading = true;
  String? _error;
  final DateFormat _timeFmt = DateFormat('HH:mm dd/MM/yyyy');

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  // Đọc đơn nghỉ phép của chính nhân viên từ Supabase
  Future<void> _loadRequests() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      setState(() {
        _loading = false;
        _error = 'Bạn cần đăng nhập lại.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await client
          .from('requests')
          .select()
          .eq('user_id', user.id)
          .eq('request_type', 'Nghỉ phép')
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _leaveRequests = (rows as List)
            .map((r) => _mapRow(Map<String, dynamic>.from(r)))
            .toList();
        _loading = false;
      });
    } catch (e) {
      debugPrint('LOAD ERROR: $e');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Không tải được danh sách đơn: $e';
      });
    }
  }

  // Đổi một dòng của bảng requests thành Map mà các card đang dùng
  Map<String, dynamic> _mapRow(Map<String, dynamic> r) {
    final content = (r['content'] ?? '').toString();

    String field(String key) {
      for (final line in content.split('\n')) {
        if (line.startsWith('$key: ')) return line.substring(key.length + 2);
      }
      return '';
    }

    final reasonIdx = content.indexOf('Lý do: ');
    final reason =
        reasonIdx >= 0 ? content.substring(reasonIdx + 7) : content;

    final time = field('Thời gian');
    final m = RegExp(r'^(.*) \((.*)\)$').firstMatch(time);
    final dateRange = m != null ? m.group(1)! : time;
    final shiftType = m != null ? m.group(2)! : 'Cả ngày';

    final created = DateTime.tryParse('${r['created_at']}')?.toLocal();
    final id = r['id'].toString();
    final shortId = id.substring(0, id.length < 8 ? id.length : 8);

    String status;
    switch (r['status']) {
      case 'APPROVED':
        status = 'Đã duyệt';
        break;
      case 'REJECTED':
        status = 'Từ chối';
        break;
      default:
        status = 'Chờ duyệt';
    }

    final leaveType = field('Loại nghỉ');
    return {
      'id': '#NP-${shortId.toUpperCase()}',
      'timeStr': created == null ? '' : '• ${_timeFmt.format(created)}',
      'status': status,
      'leaveType': leaveType.isEmpty ? (r['title'] ?? '') : leaveType,
      'leaveSubtitle': '',
      'daysCount': field('Số ngày'),
      'dateRange': dateRange,
      'shiftType': shiftType,
      'reason': reason,
      'rejectReason': r['reject_reason'] ?? '',
    };
  }

  // Mở màn hình Tạo đơn mới; gửi xong thì tải lại danh sách từ Supabase
  Future<void> _openCreateLeaveRequest() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const CreateLeaveRequestScreen(),
      ),
    );

    if (result != null) {
      await _loadRequests();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: const [
              Icon(Icons.check_circle_outline, color: Colors.white),
              SizedBox(width: 8),
              Text('Gửi đơn xin nghỉ phép thành công!'),
            ],
          ),
          backgroundColor: const Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Đếm số đơn theo trạng thái
    final pendingCount =
        _leaveRequests.where((item) => item['status'] == 'Chờ duyệt').length;
    final approvedCount =
        _leaveRequests.where((item) => item['status'] == 'Đã duyệt').length;
    final rejectedCount =
        _leaveRequests.where((item) => item['status'] == 'Từ chối').length;

    final List<Map<String, dynamic>> filters = [
      {'label': 'Tất cả', 'count': _leaveRequests.length},
      {'label': 'Chờ duyệt', 'count': pendingCount},
      {'label': 'Đã duyệt', 'count': approvedCount},
      {'label': 'Từ chối', 'count': rejectedCount},
    ];

    // Lọc danh sách đơn theo Filter tab được chọn
    final filteredList = _leaveRequests.where((item) {
      if (_selectedFilterIndex == 1) return item['status'] == 'Chờ duyệt';
      if (_selectedFilterIndex == 2) return item['status'] == 'Đã duyệt';
      if (_selectedFilterIndex == 3) return item['status'] == 'Từ chối';
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FC),
      body: SafeArea(
        child: Column(
          children: [
            // 1. Header
            _buildHeader(context),

            // 2. Filter Tabs
            _buildFilterTabs(filters),

            const SizedBox(height: 12),

            // 3. Danh sách Đơn xin nghỉ
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(_error!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                        color: Colors.redAccent)),
                                const SizedBox(height: 12),
                                OutlinedButton(
                                    onPressed: _loadRequests,
                                    child: const Text('Thử lại')),
                              ],
                            ),
                          ),
                        )
                      : filteredList.isEmpty
                          ? const Center(
                              child: Text('Không có đơn xin nghỉ phép nào',
                                  style: TextStyle(color: Colors.grey)))
                          : RefreshIndicator(
                              onRefresh: _loadRequests,
                              child: ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                itemCount: filteredList.length,
                                itemBuilder: (context, index) {
                                  final item = filteredList[index];
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 16),
                                    child: item['status'] == 'Chờ duyệt'
                                        ? _buildPendingCard(item)
                                        : item['status'] == 'Từ chối'
                                            ? _buildRejectedCard(item)
                                            : _buildApprovedCard(item),
                                  );
                                },
                              ),
                            ),
            ),
          ],
        ),
      ),

      // 4. Bottom Action Bar
      bottomNavigationBar: _buildBottomActionBar(context),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            decoration: const BoxDecoration(
              color: Color(0xFFEFF6FF),
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new,
                  size: 18, color: Colors.black87),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          Column(
            children: const [
              Text(
                'Đơn xin nghỉ phép',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Lịch sử & Tiến trình phê duyệt',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          Container(
            decoration: const BoxDecoration(
              color: Color(0xFFEFF6FF),
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(Icons.refresh,
                  size: 20, color: Color(0xFF2563EB)),
              onPressed: _loadRequests,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterTabs(List<Map<String, dynamic>> filters) {
    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filters.length,
        itemBuilder: (context, index) {
          final isSelected = _selectedFilterIndex == index;
          final item = filters[index];

          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedFilterIndex = index;
              });
            },
            child: Container(
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF2563EB) : Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? Colors.transparent
                      : Colors.grey.withOpacity(0.2),
                ),
              ),
              child: Row(
                children: [
                  Text(
                    item['label'],
                    style: TextStyle(
                      color: isSelected ? Colors.white : Colors.black87,
                      fontWeight:
                          isSelected ? FontWeight.bold : FontWeight.w500,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? Colors.white.withOpacity(0.25)
                          : Colors.grey.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${item['count']}',
                      style: TextStyle(
                        color: isSelected ? Colors.white : Colors.black54,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // Card hiển thị Đơn chờ duyệt
  Widget _buildPendingCard(Map<String, dynamic> item) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: const Border(
          left: BorderSide(color: Color(0xFFF59E0B), width: 4),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      item['id'] ?? '',
                      style: const TextStyle(
                        color: Color(0xFF2563EB),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    item['timeStr'] ?? '',
                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                ],
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.access_time_filled,
                        size: 12, color: Color(0xFFD97706)),
                    SizedBox(width: 4),
                    Text(
                      'Chờ duyệt',
                      style: TextStyle(
                        color: Color(0xFFD97706),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['leaveType'] ?? '',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    if ((item['leaveSubtitle'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        item['leaveSubtitle'],
                        style:
                            const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  item['daysCount'] ?? '',
                  style: const TextStyle(
                    color: Color(0xFF2563EB),
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF9FAFB),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    const Icon(Icons.calendar_today_outlined,
                        size: 16, color: Color(0xFF2563EB)),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        '${item['dateRange'] ?? ''} ',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                    Text(
                      '(${item['shiftType'] ?? 'Cả ngày'})',
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.notes_outlined,
                        size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    const Text('Lý do: ',
                        style: TextStyle(color: Colors.grey, fontSize: 13)),
                    Expanded(
                      child: Text(
                        item['reason'] ?? '',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: Colors.black87),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('Tiến trình phê duyệt',
                  style: TextStyle(fontSize: 12, color: Colors.grey)),
              Text('1/3 Hoàn tất',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF2563EB))),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _buildStepIcon(Icons.check, true, 'Bạn', isDone: true),
              _buildStepLine(true),
              _buildStepIcon(Icons.hourglass_top_rounded, true, 'Quản lý',
                  isCurrent: true),
              _buildStepLine(false),
              _buildStepIcon(Icons.domain, false, 'Nhân sự'),
            ],
          ),
        ],
      ),
    );
  }

  // Card hiển thị Đơn bị từ chối
  Widget _buildRejectedCard(Map<String, dynamic> item) {
    final rejectReason = (item['rejectReason'] ?? '').toString();
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: const Border(
          left: BorderSide(color: Color(0xFFEF4444), width: 4),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(item['id'] ?? '',
                      style: const TextStyle(
                          color: Colors.black54,
                          fontWeight: FontWeight.bold,
                          fontSize: 12)),
                  const SizedBox(width: 8),
                  Text(item['timeStr'] ?? '',
                      style:
                          const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('Từ chối',
                    style: TextStyle(
                        color: Color(0xFFEF4444),
                        fontWeight: FontWeight.bold,
                        fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(item['leaveType'] ?? '',
              style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87)),
          const SizedBox(height: 6),
          Text('${item['dateRange'] ?? ''} (${item['shiftType'] ?? ''})',
              style: const TextStyle(fontSize: 13, color: Colors.black87)),
          if (rejectReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Lý do từ chối: $rejectReason',
                style: const TextStyle(fontSize: 13, color: Colors.redAccent)),
          ],
        ],
      ),
    );
  }

  // Card hiển thị Đơn đã duyệt
  Widget _buildApprovedCard(Map<String, dynamic> item) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      item['id'] ?? '',
                      style: const TextStyle(
                          color: Colors.black54,
                          fontWeight: FontWeight.bold,
                          fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(item['timeStr'] ?? '',
                      style:
                          const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.check_circle,
                        size: 14, color: Color(0xFF10B981)),
                    SizedBox(width: 4),
                    Text('Đã duyệt',
                        style: TextStyle(
                            color: Color(0xFF10B981),
                            fontWeight: FontWeight.bold,
                            fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['leaveType'] ?? '',
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87),
                    ),
                    if ((item['leaveSubtitle'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(item['leaveSubtitle'],
                          style: const TextStyle(
                              fontSize: 12, color: Colors.grey)),
                    ],
                    const SizedBox(height: 6),
                    Text(
                        '${item['dateRange'] ?? ''} (${item['shiftType'] ?? ''})',
                        style: const TextStyle(
                            fontSize: 13, color: Colors.black87)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  item['daysCount'] ?? '',
                  style: const TextStyle(
                      color: Colors.black87,
                      fontWeight: FontWeight.bold,
                      fontSize: 12),
                ),
              ),
            ],
          ),
          if (item.containsKey('attachment')) ...[
            const SizedBox(height: 12),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF9FAFB),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('PDF',
                        style: TextStyle(
                            color: Colors.redAccent,
                            fontWeight: FontWeight.bold,
                            fontSize: 10)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      item['attachment'],
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: Colors.black87),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.download_rounded,
                      size: 18, color: Color(0xFF2563EB)),
                ],
              ),
            ),
          ]
        ],
      ),
    );
  }

  Widget _buildStepIcon(IconData icon, bool isActive, String label,
      {bool isDone = false, bool isCurrent = false}) {
    return Column(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: isDone
                ? const Color(0xFF10B981)
                : (isCurrent
                    ? const Color(0xFFF59E0B)
                    : const Color(0xFFE5E7EB)),
            shape: BoxShape.circle,
          ),
          child: Icon(icon,
              size: 18,
              color: isDone || isCurrent ? Colors.white : Colors.grey),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: isCurrent ? const Color(0xFFD97706) : Colors.grey,
            fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    );
  }

  Widget _buildStepLine(bool isActive) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(bottom: 16),
        color: isActive ? const Color(0xFF2563EB) : const Color(0xFFE5E7EB),
      ),
    );
  }

  // Nút Tạo đơn mới
  Widget _buildBottomActionBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.home_outlined,
                    color: Colors.black87, size: 20),
                label: const Text(
                  'Về Trang chủ',
                  style: TextStyle(
                    color: Colors.black87,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: Colors.grey.shade300),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _openCreateLeaveRequest,
                icon: const Icon(Icons.add_circle_outline,
                    color: Colors.white, size: 20),
                label: const Text(
                  'Tạo đơn mới',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
} 