import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';

import '../core/app_colors.dart';
import '../core/widgets/fx.dart';
import '../services/attendance_api.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/employee_home/home_header.dart';
import '../widgets/employee_home/checkin_card.dart';
import '../widgets/employee_home/performance_card.dart';
import '../widgets/employee_home/hr_services_grid.dart';
import '../widgets/employee_home/gps_status_card.dart';
import '../widgets/employee_home/week_status_card.dart';
import 'camera_checkin.dart'; // Import màn hình camera

import '../core/theme_controller.dart'; // themeNotifier (đổi Light/Dark)

/// Trang chủ nhân viên. Dữ liệu nghiệp vụ vẫn được lấy từ các service hiện có.
class HomeEmployeeScreen extends StatefulWidget {
  const HomeEmployeeScreen({super.key});

  @override
  State<HomeEmployeeScreen> createState() => _HomeEmployeeScreenState();
}

class _HomeEmployeeScreenState extends State<HomeEmployeeScreen> {
  Timer? _clockTimer;
  final ValueNotifier<DateTime> _now = ValueNotifier<DateTime>(DateTime.now());
  bool _busy = false;
  bool _lastActionSucceeded = false;
  int _refreshTick = 0;

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) _now.value = DateTime.now();
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _now.dispose();
    super.dispose();
  }

  Future<void> _openCamera({required bool isCheckingIn}) async {
    // Camera hiện chỉ trả ảnh/thời gian; không được tự thông báo thành công
    // khi chưa có phản hồi xác nhận từ AttendanceApi.
    if (_busy) return;
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => CameraCheckInScreen(isCheckingIn: isCheckingIn)),
    );
    if (!mounted || result == null) return;
    setState(() => _lastActionSucceeded = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Đã ghi nhận ảnh. Chưa gửi yêu cầu chấm công lên máy chủ.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = context.pal.textPrimary;
    final muted = context.pal.textSecondary;
    final today = DateFormat('EEEE, dd/MM/yyyy').format(DateTime.now());

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Row(children: [
          Container(width: 34, height: 34, decoration: BoxDecoration(color: context.pal.primary.withValues(alpha: .14), borderRadius: BorderRadius.circular(11)),
            child: Icon(Icons.business_center_rounded, color: context.pal.primary, size: 20)),
          const SizedBox(width: 10),
          Text('Humora HR', style: TextStyle(color: text, fontWeight: FontWeight.w900, fontSize: 19)),
        ]),
        actions: [
          IconButton(
            tooltip: isDark ? 'Chuyển sang Light mode' : 'Chuyển sang Dark mode',
            icon: FxSpinSwap(
              child: Icon(
                isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                key: ValueKey<bool>(isDark),
              ),
            ),
            onPressed: () => themeNotifier.value = isDark ? ThemeMode.light : ThemeMode.dark,
          ),
          const SizedBox(width: 4),
        ],
      ),
      bottomNavigationBar: const BottomNavBar(currentIndex: 0),
      body: SafeArea(
        top: false,
        child: RefreshIndicator(
          onRefresh: () async => setState(() => _refreshTick++),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 26),
            children: [
              FxReveal(index: 0, child: _welcomeCard(context, today, text, muted, isDark)),
              const SizedBox(height: 16),
              FxReveal(
                index: 1,
                child: ValueListenableBuilder<DateTime>(
                  valueListenable: _now,
                  builder: (context, now, _) => _clockCard(context, muted, now),
                ),
              ),
              const SizedBox(height: 16),
              FxReveal(index: 2, child: _sectionTitle('Ca làm việc', 'Theo dõi lịch và trạng thái hôm nay', text, muted)),
              const SizedBox(height: 10),
              FxReveal(index: 2, child: _shiftSummary(context, isDark, text, muted)),
              const SizedBox(height: 16),
              FxReveal(index: 3, child: _checkinPanel(context, isDark, text, muted)),
              const SizedBox(height: 16),
              FxReveal(index: 4, child: WeekStatusCard(refreshTick: _refreshTick)),
              const SizedBox(height: 16),
              const FxReveal(index: 5, child: HrServicesGrid()),
              const SizedBox(height: 16),
              FxReveal(index: 6, child: _sectionTitle('Hiệu suất làm việc', 'Tổng quan cá nhân', text, muted)),
              const SizedBox(height: 10),
              const FxReveal(index: 6, child: PerformanceCard()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _welcomeCard(BuildContext context, String date, Color text, Color muted, bool dark) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: dark ? const [Color(0xFF1D3D78), Color(0xFF101A2D)] : const [Color(0xFF2563EB), Color(0xFF4F83F1)]),
        boxShadow: [BoxShadow(color: context.pal.primary.withValues(alpha: .20), blurRadius: 22, offset: const Offset(0, 8))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(children: [
          // Nền cực quang + vệt sáng quét chéo.
          const Positioned.fill(child: FxAurora()),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Row(children: [
              Container(width: 52, height: 52, decoration: BoxDecoration(color: Colors.white.withValues(alpha: .16), shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: .3))),
                child: const FxWave(child: Icon(Icons.waving_hand_rounded, color: Colors.white, size: 27))),
              const SizedBox(width: 13),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Xin chào, chúc bạn một ngày tốt lành!', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 5),
                const Text('Chào mừng trở lại', style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
                const SizedBox(height: 5),
                Text(date, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
              ])),
              const Icon(Icons.verified_user_rounded, color: Colors.white70, size: 23),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _clockCard(BuildContext context, Color muted, DateTime now) {
    final surface = context.pal.surface;
    final text = context.pal.textPrimary;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: .7)),
        boxShadow: [BoxShadow(color: context.pal.shadow.withValues(alpha: context.pal.isDark ? .12 : .06), blurRadius: 16, offset: const Offset(0, 5))]),
      child: Row(children: [
        Container(width: 42, height: 42, decoration: BoxDecoration(color: context.pal.primary.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
          child: Icon(Icons.access_time_filled_rounded, color: context.pal.primary)),
        const SizedBox(width: 13),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Giờ máy chủ thời gian thực', style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          FxClockText(DateFormat('HH:mm:ss').format(now), style: TextStyle(color: text, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -.8)),
          Text(DateFormat('dd/MM/yyyy').format(now), style: TextStyle(color: muted, fontSize: 11)),
        ])),
        Container(padding: const EdgeInsets.fromLTRB(4, 3, 11, 3), decoration: BoxDecoration(color: context.pal.success.withValues(alpha: .12), borderRadius: BorderRadius.circular(30)),
          child: Row(children: [FxPulseDot(color: context.pal.success), const SizedBox(width: 1), Text('LIVE', style: TextStyle(color: context.pal.success, fontSize: 10, fontWeight: FontWeight.w900))])),
      ]),
    );
  }

  Widget _sectionTitle(String title, String subtitle, Color text, Color muted) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(title, style: TextStyle(color: text, fontSize: 17, fontWeight: FontWeight.w900)),
    const SizedBox(height: 3), Text(subtitle, style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w500)),
  ]);

  Widget _shiftSummary(BuildContext context, bool dark, Color text, Color muted) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(20), border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: .7))),
      child: Column(children: [
        Row(children: [Icon(Icons.wb_sunny_rounded, color: context.pal.primary), const SizedBox(width: 9), Expanded(child: Text('Ca làm hôm nay', style: TextStyle(color: text, fontWeight: FontWeight.w800))),
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5), decoration: BoxDecoration(color: context.pal.success.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)), child: Text('Theo lịch phân công', style: TextStyle(color: context.pal.success, fontSize: 10, fontWeight: FontWeight.w800)))]),
        const SizedBox(height: 13),
        Row(children: [Expanded(child: _shiftTime('BUỔI SÁNG', '08:00 - 12:00', Icons.wb_sunny_outlined, text, muted)), const SizedBox(width: 10), Expanded(child: _shiftTime('BUỔI CHIỀU', '13:00 - 17:00', Icons.nights_stay_outlined, text, muted))]),
        const SizedBox(height: 10),
        Row(children: [Icon(Icons.info_outline_rounded, size: 14, color: muted), const SizedBox(width: 6), Expanded(child: Text('Giờ ca thực tế được hiển thị trong mục Lịch làm.', style: TextStyle(color: muted, fontSize: 10)))]),
      ]),
    );
  }

  Widget _shiftTime(String label, String time, IconData icon, Color text, Color muted) => Container(
    padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: context.pal.primary.withValues(alpha: .07), borderRadius: BorderRadius.circular(15)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Icon(icon, size: 15, color: context.pal.primary), const SizedBox(width: 5), Text(label, style: TextStyle(color: muted, fontSize: 9, fontWeight: FontWeight.w800))]), const SizedBox(height: 6), Text(time, style: TextStyle(color: text, fontSize: 14, fontWeight: FontWeight.w900))]));

  Widget _checkinPanel(BuildContext context, bool dark, Color text, Color muted) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(22), border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: .7))),
      child: Column(children: [
        Text('CHẤM CÔNG', style: TextStyle(color: muted, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.4)),
        const SizedBox(height: 14),
        _AnimatedHomeCheckInButton(
          busy: _busy,
          onTap: () => _openCamera(isCheckingIn: true),
        ),
        const SizedBox(height: 12),
        Text('Chạm để mở camera xác thực', style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        FxPressScale(child: OutlinedButton.icon(onPressed: () => Navigator.pushNamed(context, '/employee/work_schedule'), icon: const Icon(Icons.calendar_month_rounded), label: const Text('Xem lịch làm việc'))),
      ]),
    );
  }
}


/// Nút chấm công: vòng sáng xoay + nhịp Pulse + 2 vòng sóng loang ra + nhún khi chạm.
/// Animation dừng khi bận xử lý hoặc hệ thống bật Reduce Motion.
class _AnimatedHomeCheckInButton extends StatefulWidget {
  const _AnimatedHomeCheckInButton({
    required this.busy,
    required this.onTap,
  });

  final bool busy;
  final VoidCallback onTap;

  @override
  State<_AnimatedHomeCheckInButton> createState() =>
      _AnimatedHomeCheckInButtonState();
}

class _AnimatedHomeCheckInButtonState
    extends State<_AnimatedHomeCheckInButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  bool get _canAnimate =>
      !widget.busy && !MediaQuery.disableAnimationsOf(context);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimation();
  }

  @override
  void didUpdateWidget(covariant _AnimatedHomeCheckInButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.busy != widget.busy) _syncAnimation();
  }

  void _syncAnimation() {
    if (_canAnimate) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Vòng sóng loang ra rồi mờ dần; r chạy 0 → 1.
  Widget _ring(double r, Color color) {
    final size = 137 + 37 * r;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: color.withValues(alpha: .42 * math.pow(1 - r, 1.6).toDouble()),
          width: 2,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pal;
    return Semantics(
      button: true,
      enabled: !widget.busy,
      label: 'Mở camera chấm công vào ca',
      child: SizedBox(
        width: 174,
        height: 174,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _canAnimate ? _controller.value : 0.0;
            final pulse = _canAnimate
                ? 1 + (0.025 * (0.5 - (t - 0.5).abs()) * 2)
                : 1.0;

            return Stack(
              alignment: Alignment.center,
              children: [
                if (!widget.busy && _canAnimate) ...[
                  _ring(t, pal.primary),
                  _ring((t + .5) % 1, pal.primary),
                ],
                if (!widget.busy)
                  Container(
                    width: 154 + (10 * t),
                    height: 154 + (10 * t),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: pal.primary.withValues(alpha: 0.10 * (1 - t)),
                    ),
                  ),
                Transform.rotate(
                  angle: t * 2 * math.pi,
                  child: Container(
                    width: 151,
                    height: 151,
                    padding: const EdgeInsets.all(5),
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: SweepGradient(
                        colors: [
                          Color(0x0043D9F5),
                          Color(0xFF43D9F5),
                          Color(0xFF8AB4FF),
                          Color(0x005B8CFF),
                        ],
                      ),
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: pal.surface,
                      ),
                    ),
                  ),
                ),
                Transform.scale(
                  scale: pulse,
                  child: FxPressScale(
                    scale: .93,
                    child: Material(
                      color: Colors.transparent,
                      shape: const CircleBorder(),
                      elevation: 8,
                      shadowColor: pal.primary.withValues(alpha: .38),
                      child: InkWell(
                        onTap: widget.busy ? null : widget.onTap,
                        customBorder: const CircleBorder(),
                        child: Ink(
                          width: 137,
                          height: 137,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                Color(0xFF60A5FA),
                                Color(0xFF064BC4),
                              ],
                            ),
                          ),
                          child: Center(
                            child: widget.busy
                                ? const SizedBox(
                                    width: 38,
                                    height: 38,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 3,
                                    ),
                                  )
                                : const Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.fingerprint_rounded,
                                        color: Colors.white,
                                        size: 48,
                                      ),
                                      SizedBox(height: 3),
                                      Text(
                                        'Chấm công',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          fontSize: 15,
                                        ),
                                      ),
                                      Text(
                                        'Vào ca',
                                        style: TextStyle(
                                          color: Colors.white70,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
