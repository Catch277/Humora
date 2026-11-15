import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';

/// Bộ hiệu ứng (FX) dùng chung của Humora HR.
///
/// Nguyên tắc:
///  • Chỉ dùng Transform / Opacity / CustomPainter (chạy GPU, không ép layout lại).
///  • Tự tắt khi hệ thống bật "Reduce motion" (MediaQuery.disableAnimations).
///  • Không phụ thuộc màu theme → chạy đúng ở cả Light lẫn Dark.

// ─────────────────────────────────────────────────────────────────────────────
// 1) FxReveal – xuất hiện lần lượt: mờ dần + trượt lên + phóng nhẹ.
// ─────────────────────────────────────────────────────────────────────────────
class FxReveal extends StatefulWidget {
  const FxReveal({
    super.key,
    required this.child,
    this.index = 0,
    this.delay,
    this.offset = 26,
    this.duration = const Duration(milliseconds: 620),
  });

  final Widget child;

  /// Thứ tự trong danh sách – mỗi bậc trễ thêm 75ms (tối đa 8 bậc).
  final int index;

  /// Ghi đè độ trễ nếu muốn tự chỉnh.
  final Duration? delay;

  /// Quãng trượt lên (pixel).
  final double offset;
  final Duration duration;

  @override
  State<FxReveal> createState() => _FxRevealState();
}

class _FxRevealState extends State<FxReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.duration);
  late final Animation<double> _fade = CurvedAnimation(
    parent: _c,
    curve: const Interval(0, .65, curve: Curves.easeOut),
  );
  late final Animation<double> _move =
      CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);
  late final Animation<double> _scale = Tween<double>(begin: .965, end: 1)
      .animate(CurvedAnimation(parent: _c, curve: Curves.easeOutCubic));

  Timer? _timer;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
      return;
    }
    final d = widget.delay ??
        Duration(milliseconds: 75 * widget.index.clamp(0, 8).toInt());
    _timer = Timer(d, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (context, child) => Transform.translate(
          offset: Offset(0, (1 - _move.value) * widget.offset),
          child: Transform.scale(
            scale: _scale.value,
            alignment: Alignment.topCenter,
            child: child,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) FxPressScale – nhún xuống khi chạm, bật lại có độ nảy.
//    Dùng Listener (không tranh cử chỉ) nên bọc được cả nút đã có InkWell.
// ─────────────────────────────────────────────────────────────────────────────
class FxPressScale extends StatefulWidget {
  const FxPressScale({super.key, required this.child, this.scale = .95});

  final Widget child;
  final double scale;

  @override
  State<FxPressScale> createState() => _FxPressScaleState();
}

class _FxPressScaleState extends State<FxPressScale> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: (_down && !reduce) ? widget.scale : 1,
        duration: Duration(milliseconds: _down ? 110 : 340),
        curve: _down ? Curves.easeOut : Curves.elasticOut,
        child: widget.child,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) FxAurora – nền "cực quang": 3 đốm sáng trôi chậm + vệt sáng quét chéo.
//    Đặt trong Stack, phía dưới nội dung, bên trong ClipRRect.
// ─────────────────────────────────────────────────────────────────────────────
class FxAurora extends StatefulWidget {
  const FxAurora({
    super.key,
    this.colors = const [
      Color(0xFF43D9F5), // cyan
      Color(0xFFAA8BFF), // violet
      Color(0xFF8AB4FF), // xanh nhạt
    ],
    this.sheen = true,
  });

  final List<Color> colors;

  /// Bật vệt sáng quét chéo định kỳ.
  final bool sheen;

  @override
  State<FxAurora> createState() => _FxAuroraState();
}

class _FxAuroraState extends State<FxAurora>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 12));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
      _c.value = .25;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: CustomPaint(
          painter: _AuroraPainter(_c, widget.colors, widget.sheen),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _AuroraPainter extends CustomPainter {
  _AuroraPainter(this.t, this.colors, this.sheen) : super(repaint: t);

  final Animation<double> t;
  final List<Color> colors;
  final bool sheen;

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value;
    final tau = math.pi * 2;

    // Các đốm sáng: tần số nguyên → vòng lặp liền mạch, không bị giật khi lặp.
    for (var i = 0; i < colors.length; i++) {
      final phase = i * tau / colors.length;
      final cx = size.width * (.5 + .46 * math.sin(v * tau + phase));
      final cy = size.height * (.5 + .62 * math.cos(v * tau * (i.isEven ? 1 : 2) + phase * 1.7));
      final r = size.width * (.34 + .07 * i);
      final paint = Paint()
        ..shader = RadialGradient(
          colors: [
            colors[i].withValues(alpha: .38),
            colors[i].withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: r));
      canvas.drawCircle(Offset(cx, cy), r, paint);
    }

    if (!sheen) return;
    // Vệt sáng: 3 lần/chu kỳ, mỗi lần quét trong nửa đầu rồi nghỉ.
    final s = (v * 3) % 1;
    if (s > .5) return;
    final q = Curves.easeInOut.transform(s / .5);
    const bw = 64.0;
    const skew = 36.0;
    final x = -bw - skew + (size.width + bw + skew * 2) * q;
    final path = Path()
      ..moveTo(x, 0)
      ..lineTo(x + bw, 0)
      ..lineTo(x + bw - skew, size.height)
      ..lineTo(x - skew, size.height)
      ..close();
    final sheenPaint = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.white.withValues(alpha: 0),
          Colors.white.withValues(alpha: .20),
          Colors.white.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromLTWH(x - skew, 0, bw + skew, size.height));
    canvas.drawPath(path, sheenPaint);
  }

  @override
  bool shouldRepaint(covariant _AuroraPainter old) =>
      old.colors != colors || old.sheen != sheen;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) FxWave – vẫy tay: lắc quanh cổ tay ~1.8s rồi nghỉ, lặp lại.
// ─────────────────────────────────────────────────────────────────────────────
class FxWave extends StatefulWidget {
  const FxWave({super.key, required this.child});

  final Widget child;

  @override
  State<FxWave> createState() => _FxWaveState();
}

class _FxWaveState extends State<FxWave> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 3800));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
      _c.value = 0;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (context, child) {
        final p = _c.value;
        var angle = 0.0;
        if (p < .48) {
          final q = p / .48; // 0 → 1
          angle = math.sin(q * math.pi * 3) * .42 * (1 - q * .45);
        }
        return Transform.rotate(
          angle: angle,
          alignment: const Alignment(.25, .9),
          child: child,
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) FxClockText – đồng hồ lăn số: mỗi chữ số đổi sẽ trượt lên như bảng lật.
// ─────────────────────────────────────────────────────────────────────────────
class FxClockText extends StatelessWidget {
  const FxClockText(this.text, {super.key, required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final s = style.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    final reduce = MediaQuery.disableAnimationsOf(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final ch in text.split(''))
          if (ch == ':' || reduce)
            Text(ch, style: s)
          else
            _RollChar(ch, s),
      ],
    );
  }
}

class _RollChar extends StatelessWidget {
  const _RollChar(this.ch, this.style);

  final String ch;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 320),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, anim) {
        final incoming = child.key == ValueKey<String>(ch);
        final tween = Tween<Offset>(
          begin: Offset(0, incoming ? .6 : -.6),
          end: Offset.zero,
        );
        return ClipRect(
          child: SlideTransition(
            position: tween.animate(anim),
            child: FadeTransition(opacity: anim, child: child),
          ),
        );
      },
      child: Text(ch, key: ValueKey<String>(ch), style: style),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) FxPulseDot – chấm "LIVE" có quầng sáng loang ra.
// ─────────────────────────────────────────────────────────────────────────────
class FxPulseDot extends StatefulWidget {
  const FxPulseDot({super.key, required this.color, this.size = 7});

  final Color color;
  final double size;

  @override
  State<FxPulseDot> createState() => _FxPulseDotState();
}

class _FxPulseDotState extends State<FxPulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1700));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
      _c.value = 0;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s * 2.6,
      height: s * 2.6,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = Curves.easeOut.transform(_c.value);
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: s * (1 + 1.6 * t),
                height: s * (1 + 1.6 * t),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(alpha: .45 * (1 - t)),
                ),
              ),
              Container(
                width: s,
                height: s,
                decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) FxSpinSwap – đổi icon kiểu xoay + phóng (dùng cho nút Light/Dark).
// ─────────────────────────────────────────────────────────────────────────────
class FxSpinSwap extends StatelessWidget {
  const FxSpinSwap({super.key, required this.child});

  /// Child PHẢI có `key` khác nhau cho mỗi trạng thái.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 480),
      switchInCurve: Curves.easeOutBack,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (c, anim) => RotationTransition(
        turns: Tween<double>(begin: .5, end: 1).animate(anim),
        child: ScaleTransition(
          scale: anim,
          child: FadeTransition(opacity: anim, child: c),
        ),
      ),
      child: child,
    );
  }
}
