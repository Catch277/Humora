import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../widgets/bottom_nav_bar.dart';
import '../widgets/employee_home/home_header.dart';
import '../widgets/employee_home/checkin_card.dart';
import '../widgets/employee_home/performance_card.dart';
import '../widgets/employee_home/hr_services_grid.dart';
import '../widgets/employee_home/internal_news_card.dart';
import 'camera_checkin.dart';

class HomeEmployeeScreen extends StatefulWidget {
  const HomeEmployeeScreen({super.key});

  @override
  State<HomeEmployeeScreen> createState() => _HomeEmployeeScreenState();
}

class _HomeEmployeeScreenState extends State<HomeEmployeeScreen> {
  int _selectedIndex = 0;
  bool _isSalaryVisible = true;

  Timer? _timer;
  DateTime _currentTime = DateTime.now();

  // Quản lý trạng thái Check-in / Check-out
  bool _isCheckedIn = false;
  String _checkInTime = '--:--';

  // Mốc giờ vào ca mặc định (08:30 AM)
  final TimeOfDay _shiftStart = const TimeOfDay(hour: 8, minute: 30);

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _currentTime = DateTime.now();
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  // Đếm ngược từ thời gian hiện tại về 08:30 AM
  String _getCountdownToShiftStart() {
    final now = _currentTime;
    final startDateTime = DateTime(
      now.year,
      now.month,
      now.day,
      _shiftStart.hour,
      _shiftStart.minute,
    );

    final difference = startDateTime.difference(now);

    if (difference.isNegative) {
      return 'Quá giờ vào ca';
    }

    final hours = difference.inHours;
    final minutes = difference.inMinutes.remainder(60);
    final seconds = difference.inSeconds.remainder(60);

    return 'Còn ${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  // Điều hướng mở Màn hình Camera Chụp ảnh Check-in
  Future<void> _handleCheckIn() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => CameraCheckInScreen(isCheckingIn: !_isCheckedIn),
      ),
    );

    if (result != null && result is Map<String, String>) {
      final String time = result['time'] ?? '';
      final String ip = result['ip'] ?? '';

      setState(() {
        if (!_isCheckedIn) {
          _isCheckedIn = true;
          _checkInTime = time;
        } else {
          _isCheckedIn = false;
        }
      });

      if (!mounted) return;

      final now = DateTime.now();
      final startDateTime = DateTime(
        now.year,
        now.month,
        now.day,
        _shiftStart.hour,
        _shiftStart.minute,
      );
      final isLate = now.isAfter(startDateTime);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                _isCheckedIn
                    ? (isLate ? Icons.warning_amber_rounded : Icons.check_circle_outline)
                    : Icons.exit_to_app,
                color: Colors.white,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _isCheckedIn
                      ? (isLate
                          ? 'Vào ca thành công lúc $time (Trễ) - IP: $ip'
                          : 'Vào ca thành công lúc $time (Đúng giờ) - IP: $ip')
                      : 'Ra ca thành công lúc $time! - IP: $ip',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
              ),
            ],
          ),
          backgroundColor: _isCheckedIn
              ? (isLate ? Colors.deepOrange : const Color(0xFF10B981))
              : Colors.blueAccent,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) return 'Chào buổi sáng';
    if (hour >= 12 && hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }

  String _getFormattedDate() {
    final now = DateTime.now();
    final daysOfWeek = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
    return '${daysOfWeek[now.weekday - 1]}, ${DateFormat('dd/MM/yyyy').format(now)}';
  }

  @override
  Widget build(BuildContext context) {
    final timeFormat = DateFormat('hh:mm:ss').format(_currentTime);
    final period = DateFormat('a').format(_currentTime) == 'AM' ? 'SA' : 'CH';

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF8BB5EA), // Xanh lam sáng phía trên
              Color(0xFF6B9BD2), // Xanh mờ ở giữa
              Color(0xFF90BBEA), // Xanh ánh nhạt phía dưới
            ],
          ),
        ),
        
        child: SafeArea(
          bottom: false,
          child: SingleChildScrollView(
            child: Column(
              children: [
                HomeHeader(
                  formattedDate: _getFormattedDate(),
                  greeting: _getGreeting(),
                ),
                const SizedBox(height: 16),
                CheckInCard(
                  timeFormat: timeFormat,
                  period: period,
                  countdownText: _getCountdownToShiftStart(),
                  onCheckIn: _handleCheckIn,
                  isCheckedIn: _isCheckedIn,
                  checkInTime: _checkInTime,
                ),
                const SizedBox(height: 20),
                PerformanceCard(
                  isSalaryVisible: _isSalaryVisible,
                  onToggleSalary: () {
                    setState(() {
                      _isSalaryVisible = !_isSalaryVisible;
                    });
                  },
                ),
                const SizedBox(height: 20),
                const HrServicesGrid(),
                const SizedBox(height: 20),
                const InternalNewsCard(),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: BottomNavBar(
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
      ),
    );
  }
}