import 'package:flutter/material.dart';

class CheckInCard extends StatelessWidget {
  final String timeFormat;
  final String period;
  final String countdownText;
  final VoidCallback onCheckIn;
  final bool isCheckedIn;
  final String checkInTime;
  final String shiftLabel;

  const CheckInCard({
    super.key,
    required this.timeFormat,
    required this.period,
    required this.countdownText,
    required this.onCheckIn,
    required this.isCheckedIn,
    required this.checkInTime,
    this.shiftLabel = 'Ca làm việc',
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8EFFE),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.access_time_rounded,
                    color: Color(0xFF3B82F6),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'CA LÀM VIỆC HÔM NAY',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 2),
                      RichText(
                        text: TextSpan(
                          style: TextStyle(fontSize: 14, color: Colors.black87),
                          children: [
                            TextSpan(
                              text: shiftLabel,
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isCheckedIn ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isCheckedIn ? 'Đã trong ca' : '8h00 tiêu chuẩn ($countdownText)',
                    style: TextStyle(
                      color: isCheckedIn ? const Color(0xFF10B981) : const Color(0xFFD97706),
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  timeFormat,
                  style: const TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                    color: Colors.black,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  period,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(Icons.location_on, color: Color(0xFF10B981), size: 16),
                SizedBox(width: 4),
                Text(
                  'Hợp lệ: WiFi Corp_HQ_Floor6 (GPS 5m)',
                  style: TextStyle(
                    color: Color(0xFF10B981),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // NÚT VÀO CA / RA CA
            Container(
              width: double.infinity,
              height: 52,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isCheckedIn
                      ? [const Color(0xFFEF4444), const Color(0xFFDC2626)] // Đỏ khi Ra Ca
                      : [const Color(0xFF3B82F6), const Color(0xFF4F46E5)], // Xanh khi Vào Ca
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: (isCheckedIn ? Colors.red : const Color(0xFF4F46E5)).withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ElevatedButton(
                onPressed: onCheckIn,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isCheckedIn ? Icons.logout_rounded : Icons.camera_alt_outlined,
                      color: Colors.white,
                      size: 24,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isCheckedIn ? 'RA CA (CHECK-OUT)' : 'VÀO CA (CHECK-IN)',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildTimeStatCard(
                    title: 'GIỜ VÀO',
                    time: checkInTime,
                    icon: Icons.check,
                    iconColor: isCheckedIn ? const Color(0xFF10B981) : Colors.grey,
                    iconBgColor: isCheckedIn ? const Color(0xFFD1FAE5) : const Color(0xFFF3F4F6),
                    timeColor: isCheckedIn ? const Color(0xFF10B981) : Colors.black54,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTimeStatCard(
                    title: 'GIỜ RA DỰ KIẾN',
                    time: '17:30 PM',
                    icon: Icons.hourglass_empty,
                    iconColor: const Color(0xFFF59E0B),
                    iconBgColor: const Color(0xFFFEF3C7),
                    timeColor: Colors.black87,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimeStatCard({
    required String title,
    required String time,
    required IconData icon,
    required Color iconColor,
    required Color iconBgColor,
    required Color timeColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.grey,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                time,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: timeColor,
                ),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: iconBgColor,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 16),
          )
        ],
      ),
    );
  }
}