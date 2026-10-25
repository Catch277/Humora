import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class PolicyBenefitsScreen extends StatefulWidget {
  const PolicyBenefitsScreen({super.key});

  @override
  State<PolicyBenefitsScreen> createState() => _PolicyBenefitsScreenState();
}

class _PolicyBenefitsScreenState extends State<PolicyBenefitsScreen> {
  int _selectedFilterIndex = 0;

  // Hàm xử lý mở link tải PDF
  Future<void> _downloadPDF() async {
    // Thay thế link này bằng URL chứa file PDF thật của công ty bạn
    const String pdfUrl = 'https://drive.google.com/file/d/1zRtw6QBKpqXn0RDu43_GqGmfVBhBlc0z/view?usp=sharing'; 
    final Uri url = Uri.parse(pdfUrl);

    try {
      // Mở trình duyệt ngoài để thiết bị tự động tải xuống hoặc hiển thị PDF
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
        throw Exception('Không thể mở liên kết');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Không thể tải tệp PDF lúc này.'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FC),
      body: SafeArea(
        child: Column(
          children: [
            // 1. APP BAR
            _buildAppBar(context),

            // 2. NỘI DUNG CUỘN
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header Card (Quy chế chung)
                    _buildHeaderCard(),
                    
                    // SECTION 1: Chăm lo đời sống
                    _buildSectionTitle(
                        Icons.favorite, 'Chăm lo Đời sống', const Color(0xFF10B981)),
                    _buildLifeCareSection(),
                    const SizedBox(height: 24),

                    // SECTION 2: Thưởng & Cống hiến
                    _buildSectionTitle(
                        Icons.emoji_events, 'Chế độ Thưởng & Cống hiến', const Color(0xFF2563EB),
                        trailingText: 'LỄ TẾT & KPI'),
                    _buildBonusSection(),
                    const SizedBox(height: 24),

                    // SECTION 3: Kỷ luật & Xử lý (CÓ DROPDOWN NHƯ YÊU CẦU)
                    _buildSectionTitle(
                        Icons.gavel, 'Kỷ luật & Xử lý Vi phạm', const Color(0xFFEF4444),
                        trailingText: 'BLLĐ 2019'),
                    _buildDisciplineSection(),
                    const SizedBox(height: 24),

                    // FOOTER TÀI LIỆU
                    _buildFooterCard(),
                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ===================== APP BAR =====================
  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: const Icon(Icons.arrow_back, size: 24, color: Colors.black87),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text(
                    'HUMORA HR',
                    style: TextStyle(fontSize: 10, color: Color(0xFF2563EB), fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Quy Chế & Phúc Lợi',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                ],
              ),
            ],
          ),
          Row(
            children: [
              const Icon(Icons.search, size: 24, color: Colors.black54),
              const SizedBox(width: 12),
              CircleAvatar(
                radius: 16,
                backgroundColor: Colors.blue.shade100,
                child: const Icon(Icons.person_outline, size: 18, color: Colors.blue),
              )
            ],
          )
        ],
      ),
    );
  }

  // ===================== HEADER TÀI LIỆU =====================
  Widget _buildHeaderCard() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildTag(Icons.verified, 'Số 2026/QC-HR', const Color(0xFFEEF2FF), const Color(0xFF4F46E5)),
              const SizedBox(width: 8),
              _buildTag(Icons.event_available, 'Hiệu lực: 01/01/2026', const Color(0xFFECFDF5), const Color(0xFF10B981)),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Phúc lợi, Đãi ngộ & Kỷ luật 2026',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
          ),
          const SizedBox(height: 8),
          const Text(
            'Áp dụng cho toàn thể CBNV Humora Software Solutions: Dev, QA, BA, PM, DevOps, UI/UX và Khối Hỗ trợ Vận hành.',
            style: TextStyle(fontSize: 13, color: Colors.black54, height: 1.4),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: const Color(0xFFF4F6FC), borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: const [
                Icon(Icons.search, size: 20, color: Colors.grey),
                SizedBox(width: 10),
                Text('Tìm mức thưởng, trợ cấp, tiêu chuẩn', style: TextStyle(color: Colors.grey, fontSize: 13)),
              ],
            ),
          )
        ],
      ),
    );
  }

  Widget _buildTag(IconData icon, String text, Color bgColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          Icon(icon, size: 12, color: textColor),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: textColor, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  

  Widget _buildSectionTitle(IconData icon, String title, Color iconBgColor, {String? trailingText}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: iconBgColor.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                child: Icon(icon, size: 18, color: iconBgColor),
              ),
              const SizedBox(width: 8),
              Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.black87)),
            ],
          ),
          if (trailingText != null)
            Text(trailingText, style: const TextStyle(fontSize: 12, color: Color(0xFF2563EB), fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  // ===================== CHĂM LO ĐỜI SỐNG =====================
  Widget _buildLifeCareSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _buildNormalCard(Icons.local_hospital, 'Đau ốm, Viện phí kéo dài', 'CBNV nằm viện từ 3 ngày trở lên (Ban NS thăm hỏi)', const Color(0xFF3B82F6)),
          _buildNormalCard(Icons.pregnant_woman, 'Chế độ Thai sản (Sản phụ)', 'Chi trả cùng kỳ lương tháng sinh nở', const Color(0xFF10B981)),
          _buildNormalCard(Icons.child_care, 'Chào đón Em bé mới sinh', 'Áp dụng cho cả bố & mẹ là nhân sự chính thức', const Color(0xFF6366F1)),
          _buildNormalCard(Icons.favorite, 'Mừng Cưới hỏi CBNV', 'Trao thiệp mừng + nghỉ 03 ngày nguyên lương', const Color(0xFF3B82F6)),
          _buildNormalCard(Icons.group, 'Viếng Tang Lễ (Tứ thân phụ mẫu)', 'Đoàn đại diện công ty đến phúng viếng & chia buồn', Colors.grey.shade600),
          _buildNormalCard(Icons.cake, 'Sinh nhật Thành viên', 'Tổ chức Happy Hour hàng tháng tại văn phòng', const Color(0xFF10B981)),
        ],
      ),
    );
  }

  Widget _buildNormalCard(IconData icon, String title, String subtitle, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.black87)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              ],
            ),
          )
        ],
      ),
    );
  }

  // ===================== CHẾ ĐỘ THƯỞNG =====================
  Widget _buildBonusSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          // Thẻ Xanh Highlight
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF3B82F6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
                      child: const Text('Lương tháng 13 + Bonus KD', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    const Icon(Icons.star, color: Colors.white, size: 24),
                  ],
                ),
                const SizedBox(height: 12),
                const Text('Thưởng Tết & Chuyến đi Nghỉ mát', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text(
                  'Đảm bảo tối thiểu 01 tháng thu nhập cho nhân sự tròn 12 tháng làm việc, tăng lũy tiến theo hiệu quả sản phẩm. Nghỉ mát thường niên 100% công ty tài trợ.',
                  style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('TEAMBUILDING', style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
                        Text('Resort 4-5 Sao', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('DỊP 8/3 - 20/10 - 1/6', style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
                        Text('200K – 500K / Dịp', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                      ],
                    )
                  ],
                )
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('MỐC VINH DANH THÂM NIÊN (LOYALTY MILESTONES)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.black54)),
          const SizedBox(height: 12),
          
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.8,
            children: [
              _buildMilestoneCard('1 Năm', '1.000.000 đ', 'Giấy ghi nhận cống hiến', Icons.military_tech, const Color(0xFFEFF6FF), const Color(0xFF2563EB)),
              _buildMilestoneCard('3 Năm', '3.000.000 đ', 'Bộ quà lưu niệm Humora', Icons.verified, const Color(0xFFEFF6FF), const Color(0xFF2563EB)),
              _buildMilestoneCard('5 Năm', '5.000.000 đ', 'Kỷ niệm chương khắc tên', Icons.emoji_events, const Color(0xFFECFDF5), const Color(0xFF10B981)),
              _buildMilestoneCard('7 Năm', '8.000.000 đ', 'Kỳ nghỉ dưỡng tri ân', Icons.flight_takeoff, const Color(0xFFEFF6FF), const Color(0xFF2563EB)),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(color: Color(0xFF2563EB), shape: BoxShape.circle),
                  child: const Text('10+', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('Cột Mốc Kim Cương (>10 Năm)', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.black87)),
                      Text('Thưởng từ 10.000.000đ + Vinh danh toàn công ty', style: TextStyle(fontSize: 12, color: Colors.black54)),
                    ],
                  ),
                ),
                const Icon(Icons.diamond, color: Color(0xFF2563EB)),
              ],
            ),
          )
        ],
      ),
    );
  }

  Widget _buildMilestoneCard(String year, String money, String sub, IconData icon, Color bgColor, Color iconColor) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
                child: Text(year, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: iconColor)),
              ),
              Icon(icon, size: 16, color: iconColor),
            ],
          ),
          const SizedBox(height: 6),
          Text(money, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: iconColor)),
          Text(sub, style: const TextStyle(fontSize: 10, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  // ===================== KỶ LUẬT (CÓ CHỨC NĂNG DROPDOWN) =====================
  Widget _buildDisciplineSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          ExpandableDisciplineCard(
            title: 'Nguyên tắc Nhân văn & Thượng tôn Pháp luật',
            icon: Icons.shield_outlined,
            contentWidget: const Text(
              'Công ty tuyệt đối không áp dụng hình thức phạt tiền mặt hay khấu trừ lương trái quy định Điều 127 Bộ luật Lao động. Mọi xử lý đều dựa trên giải trình minh bạch và biên bản hội đồng.',
              style: TextStyle(fontSize: 13, color: Colors.black54, height: 1.4),
            ),
          ),
          ExpandableDisciplineCard(
            title: '1. Giờ giấc & Ngày công',
            tagText: 'Thời gian',
            contentWidget: const Text(
              'Đi muộn/về sớm được bù trừ hợp lý qua hệ thống log task. Trường hợp nghỉ không phép quá 03 ngày trong tháng sẽ bị lập biên bản nhắc nhở bằng văn bản và trừ điểm chuyên cần quý.',
              style: TextStyle(fontSize: 13, color: Colors.black54, height: 1.4),
            ),
          ),
          ExpandableDisciplineCard(
            title: '2. Lộ trình Cải thiện Năng lực (PIP)',
            contentWidget: const Text(
              'Khi nhân sự không hoàn thành KPI sprint, PM và Tech Lead có trách nhiệm xây dựng lộ trình PIP kèm Mentor 1-1 hỗ trợ trước khi xem xét các biện pháp điều chuyển vị trí phù hợp hơn.',
              style: TextStyle(fontSize: 13, color: Colors.black54, height: 1.4),
            ),
          ),
          ExpandableDisciplineCard(
            title: '3. Các Hành vi Buộc Sa thải / Chấm dứt HĐ',
            titleColor: const Color(0xFFDC2626),
            tagText: 'Nghiêm trọng',
            tagBg: const Color(0xFFFEE2E2),
            tagColor: const Color(0xFFDC2626),
            contentWidget: Column(
              children: [
                _buildRedBullet('Làm rò rỉ Source Code dự án, dữ liệu khách hàng hoặc bí mật công nghệ của Humora.'),
                _buildRedBullet('Tự ý bỏ việc 05 ngày cộng dồn trong 30 ngày hoặc 20 ngày trong 365 ngày không có lý do chính đáng.'),
                _buildRedBullet('Gian lận tài chính công ty, nhận hối lộ từ đối tác thầu phụ hoặc khách hàng bên ngoài.'),
                _buildRedBullet('Quấy rối, sử dụng chất kích thích bị cấm hoặc gây gổ đe dọa an toàn môi trường làm việc.'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRedBullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cancel_outlined, color: Colors.red, size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: Colors.black87, height: 1.4))),
        ],
      ),
    );
  }

  // ===================== FOOTER CARD =====================
  Widget _buildFooterCard() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: const BoxDecoration(color: Color(0xFFEFF6FF), shape: BoxShape.circle),
                child: const Icon(Icons.verified, color: Color(0xFF2563EB)),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text('Ban Nhân sự & Ban Giám đốc Humora', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  Text('Đã ký số và ban hành lưu trữ nội bộ', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              )
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.chat_bubble_outline, size: 18),
                  label: const Text('Hỏi đáp HR'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.black87,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _downloadPDF, // <-- Gắn hàm _downloadPDF vào đây
                  icon: const Icon(Icons.download, size: 18),
                  label: const Text('Tải PDF Gốc', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Mã tài liệu: HUMORA-DOCS-QC2026-v1.0.4 • Bảo mật nội bộ', style: TextStyle(fontSize: 10, color: Colors.grey)),
        ],
      ),
    );
  }
}

// ===================== WIDGET DROPDOWN CARD =====================
class ExpandableDisciplineCard extends StatefulWidget {
  final String title;
  final Widget contentWidget;
  final IconData? icon;
  final Color titleColor;
  final String? tagText;
  final Color? tagBg;
  final Color? tagColor;

  const ExpandableDisciplineCard({
    super.key,
    required this.title,
    required this.contentWidget,
    this.icon,
    this.titleColor = Colors.black87,
    this.tagText,
    this.tagBg,
    this.tagColor,
  });

  @override
  State<ExpandableDisciplineCard> createState() => _ExpandableDisciplineCardState();
}

class _ExpandableDisciplineCardState extends State<ExpandableDisciplineCard> {
  // Biến quản lý trạng thái Đóng/Mở
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Column(
        children: [
          // Phần Tiêu đề có thể click vào để thả xuống
          InkWell(
            onTap: () {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.icon != null) ...[
                    Icon(widget.icon, color: const Color(0xFF2563EB), size: 20),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: Text(
                      widget.title,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: widget.titleColor),
                    ),
                  ),
                  if (widget.tagText != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: widget.tagBg ?? const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        widget.tagText!,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: widget.tagColor ?? Colors.black54),
                      ),
                    ),
                  ],
                  const SizedBox(width: 8),
                  // Icon mũi tên thay đổi hướng tùy trạng thái
                  Icon(
                    _isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: Colors.grey,
                  ),
                ],
              ),
            ),
          ),
          
          // Phần nội dung bên trong, bọc bằng AnimatedCrossFade để tạo hiệu ứng thả xuống mượt mà
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity, height: 0),
            secondChild: Padding(
              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
              child: widget.contentWidget,
            ),
            crossFadeState: _isExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 250),
          ),
        ],
      ),
    );
  }
}