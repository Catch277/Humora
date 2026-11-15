import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/app_colors.dart';
import '../data/services/api_error.dart';
import '../data/services/attendance_service.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/employee_home/home_header.dart';
import '../widgets/employee_home/checkin_card.dart';
import '../widgets/employee_home/performance_card.dart';
import '../widgets/employee_home/hr_services_grid.dart';
import '../widgets/employee_home/gps_status_card.dart';
import '../widgets/employee_home/week_status_card.dart';
import 'camera_checkin.dart'; // Import màn hình camera

class _LocationException implements Exception {
  _LocationException(this.message);
  final String message;
}

class HomeEmployeeScreen extends StatefulWidget {
  const HomeEmployeeScreen({super.key});

  @override
  State<HomeEmployeeScreen> createState() => _HomeEmployeeScreenState();
}

class _HomeEmployeeScreenState extends State<HomeEmployeeScreen> with WidgetsBindingObserver {
  int _selectedIndex = 0;
  int _refreshTick = 0;
  String _shiftLabel = 'Ca làm việc';

  Timer? _timer;
  DateTime _currentTime = DateTime.now();

  final AttendanceService _attendance = AttendanceService();

  // Trạng thái chấm công (lấy từ server qua /today)
  bool _isCheckedIn = false;
  String _checkInTime = '--:--';
  String? _shiftId; // ca đang chờ chấm vào, hoặc ca đang mở
  bool _busy = false;
  bool _completedToday = false; // đã vào và ra hết các ca hôm nay
  String? _reopenShiftId; // ca đã chấm ra nhưng chưa hết giờ: lần bấm tới là "vào ca lại"
  bool _success = false; // bật vài giây để hiện dấu tích sau khi chấm công thành công
  GpsState _gps = GpsState.checking;
  Timer? _successTimer;

  TimeOfDay _shiftStart = const TimeOfDay(hour: 8, minute: 30);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkGps();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _currentTime = DateTime.now();
        });
      }
    });
    _loadToday();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _successTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Người dùng vừa quay lại từ màn hình cài đặt: kiểm tra lại GPS/quyền.
    if (state == AppLifecycleState.resumed) _checkGps();
  }

  // ---------- Định vị ----------

  Future<void> _checkGps() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) setState(() => _gps = GpsState.serviceOff);
        return;
      }
      final perm = await Geolocator.checkPermission();
      final next = switch (perm) {
        LocationPermission.denied => GpsState.denied,
        LocationPermission.deniedForever => GpsState.deniedForever,
        _ => GpsState.ready,
      };
      if (mounted) setState(() => _gps = next);
    } catch (_) {
      // Nền tảng không hỗ trợ kiểm tra: để nút chấm công tự xử lý khi bấm.
      if (mounted) setState(() => _gps = GpsState.ready);
    }
  }

  Future<void> _fixGps() async {
    switch (_gps) {
      case GpsState.serviceOff:
        await Geolocator.openLocationSettings();
        break;
      case GpsState.denied:
        await Geolocator.requestPermission();
        break;
      case GpsState.deniedForever:
        await Geolocator.openAppSettings();
        break;
      default:
        break;
    }
    await _checkGps();
  }

  // ---------- Gọi API ----------

  TimeOfDay? _parseHm(String? s) {
    if (s == null) return null;
    final p = s.split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]);
    final m = int.tryParse(p[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  /// Ca đã hết giờ chưa — cùng mốc với `isShiftStillRunning` của web và `attendance_clock_in`
  /// (SCRUM-96): chỉ ca chưa tan mới được "vào ca lại". Ca không có giờ (mẫu `Nghỉ`) coi như đã tan.
  bool _shiftHasEnded(TodayAssignment? assignment) {
    final start = _parseHm(assignment?.start);
    final end = _parseHm(assignment?.end);
    if (end == null) return true;

    final now = DateTime.now();
    var endAt = DateTime(now.year, now.month, now.day, end.hour, end.minute);
    // Ca qua đêm: giờ kết thúc nhỏ hơn giờ bắt đầu thì kết thúc nằm ở ngày hôm sau.
    if (start != null &&
        end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
      endAt = endAt.add(const Duration(days: 1));
    }
    return !now.isBefore(endAt);
  }

  /// Giờ trên thẻ ca, theo giờ máy (ví dụ "08:31 AM") — giữ nguyên định dạng màn hình đang dùng.
  String _fmtTimeOf(DateTime? at) =>
      at == null ? '--:--' : DateFormat('hh:mm a').format(at.toLocal());

  Future<void> _loadToday() async {
    try {
      final snapshot = await _attendance.today();
      final open = snapshot.attendance.where((a) => a.isOpen).firstOrNull;

      // Một ca đã chấm ra vẫn mở lại được ("Vào ca lại", SCRUM-96) chừng nào ca chưa hết giờ,
      // nên chỉ ca đã tan mới bị loại khỏi danh sách chờ vào ca.
      final assignmentByShift = {
        for (final a in snapshot.assignments) a.shiftId: a,
      };
      final closedIds = snapshot.attendance
          .where((a) =>
              a.checkOutAt != null &&
              _shiftHasEnded(assignmentByShift[a.shiftId]))
          .map((a) => a.shiftId)
          .toSet();

      final TodayAssignment? target = open != null
          ? assignmentByShift[open.shiftId]
          : snapshot.assignments
              .where((a) => !closedIds.contains(a.shiftId))
              .firstOrNull;

      // Ca đang là "ca chờ" mà đã có dòng chấm công đóng lại: lần bấm tới sẽ vào ca lại, giờ vào
      // cũ được giữ nguyên (hàm SQL chỉ xoá các cột giờ ra).
      String? reopenShiftId;
      if (target != null) {
        final closed = snapshot.attendance
            .any((a) => a.shiftId == target.shiftId && a.checkOutAt != null);
        if (closed) reopenShiftId = target.shiftId;
      }

      if (!mounted) return;
      setState(() {
        final completed =
            open == null && target == null && snapshot.attendance.isNotEmpty;
        _completedToday = completed;
        _isCheckedIn = open != null;
        _checkInTime = _fmtTimeOf(open?.checkInAt);
        _shiftId = open?.shiftId ?? target?.shiftId;
        _reopenShiftId = reopenShiftId;

        final start = _parseHm(target?.start);
        if (start != null) _shiftStart = start;

        final name = target?.name ?? '';
        final st = target?.start;
        final en = target?.end;
        if (target != null && name.isNotEmpty) {
          _shiftLabel = (st != null && en != null) ? '$name ($st - $en)' : name;
        } else if (target != null && st != null && en != null) {
          _shiftLabel = 'Ca $st - $en';
        } else if (target != null || open != null) {
          // Ca chưa đủ dữ liệu, hoặc dòng công đang mở mà ca đã bị xoá khỏi lịch.
          _shiftLabel = 'Ca làm việc';
        } else {
          _shiftLabel =
              completed ? 'Đã hoàn tất các ca hôm nay' : 'Hôm nay không có ca';
        }
      });
    } catch (e) {
      _showError(e);
    }
  }

  Future<Position> _getPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw _LocationException('Hãy bật định vị (GPS) trên thiết bị.');
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      throw _LocationException(
          'Bạn cần cho phép ứng dụng truy cập vị trí để chấm công.');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  void _showSnack(String text,
      {required Color color, required IconData icon}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
          ],
        ),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _showError(Object e) {
    final String text;
    if (e is AppException) {
      // Lỗi đã được dịch sẵn ở `data/services` (chấm công, bảng công, khiếu nại).
      text = e.message;
    } else if (e is _LocationException) {
      text = e.message;
    } else if (e is PostgrestException) {
      text = toAppException(e).message;
    } else {
      text = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    }
    _showSnack(text, color: Colors.redAccent, icon: Icons.error_outline);
  }

  // Đếm ngược từ thời gian hiện tại về giờ vào ca
  String _getCountdownToShiftStart() {
    if (_shiftId == null && !_isCheckedIn) return 'Không còn ca hôm nay';

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

  // Mở camera, chụp xong thì lấy GPS rồi gọi API chấm công
  Future<void> _handleCheckIn() async {
    if (_busy) return;
    final checkingIn = !_isCheckedIn;

    if (checkingIn && _shiftId == null) {
      _showSnack('Hôm nay bạn không có ca nào để chấm công.',
          color: Colors.orange, icon: Icons.info_outline);
      return;
    }

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => CameraCheckInScreen(isCheckingIn: checkingIn),
      ),
    );
    if (result == null || result is! Map<String, dynamic>) return;
    if (!mounted) return;

    final ip = (result['ip'] ?? '').toString();
    final photo = result['bytes'] is Uint8List ? result['bytes'] as Uint8List : null;
    setState(() => _busy = true);

    try {
      final pos = await _getPosition();
      final clock = checkingIn
          ? await _attendance.checkIn(
              _shiftId!,
              pos.latitude,
              pos.longitude,
              photoBytes: photo,
            )
          : await _attendance.checkOut(
              pos.latitude,
              pos.longitude,
              photoBytes: photo,
            );

      final status = clock.status;
      if (checkingIn) {
        final time = _fmtTimeOf(clock.checkInAt);
        if (_reopenShiftId != null && _reopenShiftId == clock.shiftId) {
          // "Vào ca lại": hàm SQL giữ nguyên giờ vào cũ, chỉ mở lại dòng công.
          _showSnack(
            'Đã vào ca lại lúc $time (giờ vào giữ nguyên) - IP: $ip',
            color: Colors.blueAccent,
            icon: Icons.refresh_rounded,
          );
        } else {
          final isLate = status == 'LATE';
          _showSnack(
            'Vào ca thành công lúc $time (${isLate ? 'Trễ' : 'Đúng giờ'}) - IP: $ip',
            color: isLate ? Colors.deepOrange : const Color(0xFF10B981),
            icon: isLate
                ? Icons.warning_amber_rounded
                : Icons.check_circle_outline,
          );
        }
      } else {
        final time = _fmtTimeOf(clock.checkOutAt);
        final early = status == 'EARLY_LEAVE';
        _showSnack(
          'Ra ca thành công lúc $time${early ? ' (Về sớm)' : ''}! - IP: $ip',
          color: Colors.blueAccent,
          icon: Icons.exit_to_app,
        );
      }
      await _loadToday();
      if (mounted) {
        setState(() => _success = true);
        _successTimer?.cancel();
        _successTimer = Timer(const Duration(milliseconds: 1600), () {
          if (mounted) setState(() => _success = false);
        });
      }
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  CheckInPhase get _phase {
    if (_isCheckedIn) return CheckInPhase.working;
    if (_shiftId != null) return CheckInPhase.ready;
    return _completedToday ? CheckInPhase.done : CheckInPhase.noShift;
  }

  String _timezoneLabel() {
    final off = _currentTime.timeZoneOffset;
    final sign = off.isNegative ? '-' : '+';
    final h = off.inHours.abs();
    final m = off.inMinutes.abs().remainder(60);
    return 'GMT$sign$h${m == 0 ? '' : ':${m.toString().padLeft(2, '0')}'}';
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
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([_loadToday(), _checkGps()]);
          if (mounted) setState(() => _refreshTick++);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            children: [
              HomeHeader(
                formattedDate: _getFormattedDate(),
                greeting: _getGreeting(),
              ),
              const SizedBox(height: 8),
              ClockCard(
                timeFormat: timeFormat,
                period: period,
                dateText: _getFormattedDate(),
                timezone: _timezoneLabel(),
              ),
              const SizedBox(height: 12),
              GpsStatusCard(state: _gps, onAction: _gps == GpsState.ready || _gps == GpsState.checking ? _checkGps : _fixGps),
              const SizedBox(height: 12),
              TodayShiftCard(
                phase: _phase,
                shiftLabel: _shiftLabel,
                countdownText: _getCountdownToShiftStart(),
                checkInTime: _checkInTime,
              ),
              const SizedBox(height: 12),
              CheckInAction(
                phase: _phase,
                busy: _busy,
                success: _success,
                onPressed: _handleCheckIn,
              ),
              const SizedBox(height: 12),
              WeekStatusCard(refreshTick: _refreshTick),
              const SizedBox(height: 12),
              const HrServicesGrid(),
              const SizedBox(height: 12),
              PerformanceCard(refreshTick: _refreshTick),
              const SizedBox(height: 28),
            ],
          ),
        ),
      ),
      bottomNavigationBar: BottomNavBar(currentIndex: _selectedIndex),
    );
  }
}
