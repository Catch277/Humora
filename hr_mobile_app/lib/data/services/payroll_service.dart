import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/format.dart';
import '../models/payslip.dart';
import 'api_error.dart';

/// Mã lỗi máy của các hàm lương (SCRUM-90/92/93/99/100), dịch sang đúng câu người dùng thấy trên web
/// (`lib/domain/payrollMessages.ts` + `lib/i18n/messages/vi.ts`).
///
/// Hàm SQL luôn `raise exception 'TOKEN: …'`, nên chỉ phần TOKEN được so khớp — phần đuôi tiếng Anh
/// không bao giờ hiện ra, và nhiều tình huống khác nhau dùng chung một tiền tố.
const Map<String, String> payrollErrorMessages = {
  'AUTH_REQUIRED': 'Bạn cần đăng nhập để thực hiện thao tác này.',
  'PAYROLL_OWNER_ONLY': 'Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.',
  'PAYROLL_NO_ORGANIZATION': 'Tài khoản chưa thuộc tổ chức nào nên không có bảng lương.',
  'PAYROLL_AUDIT_APPEND_ONLY': 'Nhật ký lương chỉ được ghi thêm, không sửa hay xoá được.',
  'PAYROLL_EMPLOYEE_NOT_FOUND': 'Không tìm thấy nhân viên trong tổ chức.',
  'PAY_PROFILE_NOT_FOUND': 'Không tìm thấy đơn giá giờ trong tổ chức.',
  'PAY_PROFILE_DUPLICATE':
      'Nhân viên này đã có đơn giá bắt đầu từ ngày đó. Hãy chọn ngày khác hoặc sửa dòng đã có.',
  'PAYSLIP_NOT_FOUND': 'Không tìm thấy phiếu lương.',
  'PAYSLIP_NOT_FOUND_OR_NOT_DRAFT': 'Không tìm thấy phiếu lương nháp cần thao tác.',
  'PAYSLIP_ITEM_NOT_FOUND': 'Không tìm thấy khoản mục trong phiếu lương.',
  'PAYSLIP_IMMUTABLE':
      'Phiếu lương đã phát hành hoặc đã huỷ nên không sửa được. Hãy huỷ phiếu rồi tạo lại.',
  'PAYSLIP_BAD_STATUS': 'Trạng thái phiếu lương không cho phép thao tác này.',
  'PAYSLIP_NO_OPEN_DISPUTE': 'Phiếu lương này không có khiếu nại nào đang mở.',
  'PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN':
      'Không tìm thấy phiếu lương của bạn, hoặc phiếu đã có khiếu nại đang chờ xử lý.',
  'PAYROLL_FUTURE_PERIOD': 'Không thể tạo phiếu lương cho tháng ở tương lai.',
  'PAYROLL_PERIOD_NOT_FINISHED': 'Tháng này chưa kết thúc nên chưa phát hành phiếu lương được.',
  'PAYSLIP_VOID_REASON_REQUIRED': 'Vui lòng nhập lý do huỷ phiếu (5-300 ký tự).',
  'PAYSLIP_DISPUTE_NOTE_LENGTH': 'Nội dung thắc mắc phải từ 5 đến 500 ký tự.',
  'PAYSLIP_DEDUCTIONS_EXCEED_GROSS': 'Tổng khấu trừ vượt quá thu nhập của phiếu lương.',
  'PAYSLIP_TARGET_INVALID': 'Số tiền thực nhận phải từ 0 đến 1.000.000.000 ₫.',
  'PAYSLIP_NET_MISMATCH': 'Không chốt được số tiền thực nhận, hãy thử lại.',
  'DEMO_PAY_NOT_FOUND': 'Không tìm thấy mức lương thử việc trong tổ chức.',
  'DEMO_PAY_DUPLICATE':
      'Vị trí này đã có một mức lương thử việc bắt đầu từ ngày đó. Hãy chọn ngày khác hoặc sửa dòng đã có.',
  'DEMO_PAY_DEDUCTIONS_EXCEED_GROSS': 'Tổng khấu trừ vượt quá thu nhập của mức lương thử việc.',
  'DEMO_PAY_POSITION_REQUIRED': 'Vui lòng chọn vị trí cho mức lương thử việc.',
};

/// Token luôn là từ đầu tiên của `raise exception 'TOKEN: …'` (`payrollErrors.ts` của web).
String? _payrollToken(String message) {
  final match = RegExp(r'^[A-Z][A-Z0-9_]{3,}').firstMatch(message.trim());
  return match?.group(0);
}

/// Câu tiếng Việt của một lỗi PostgREST thuộc bảng lương, hoặc `null` khi không nhận ra token (để
/// `toAppException` xử lý như một lỗi mạng / quyền / schema).
///
/// Tách khỏi `_payrollException` để kiểm thử được: tiền tố `PAYSLIP_NOT_FOUND` nằm trong
/// `PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN`, nên so khớp bằng `contains` sẽ trả sai câu — đây là chỗ dễ
/// tái phát nhất của bảng lương.
String? payrollErrorText(String rawMessage) {
  final token = _payrollToken(rawMessage);
  return token == null ? null : payrollErrorMessages[token];
}

/// Lỗi Supabase → câu tiếng Việt.
///
/// Phân loại theo **token** chứ không theo mã Postgres: `P0002` vừa là "không có phiếu lương"
/// vừa là "phiếu đang có khiếu nại mở", nên mã lỗi một mình sẽ nói sai một trong hai trường hợp.
AppException _payrollException(Object e) {
  if (e is AppException) return e;
  if (e is PostgrestException) {
    final message = payrollErrorText(e.message);
    if (message != null) return AppException(message);
  }
  return toAppException(e);
}

/// Đọc phiếu lương qua Supabase. Mọi quyền truy cập do RLS và các hàm SQL quyết định
/// (xem SCRUM-90_payroll.sql): app chỉ đọc được phiếu ĐÃ CÔNG BỐ của chính mình.
/// App không bao giờ tự tính hay gửi số tiền lên server.
class PayrollService {
  PayrollService({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  static const Duration _timeout = Duration(seconds: 20);

  String get _uid {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw AppException('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
    return id;
  }

  /// Thu nhập tạm tính của tháng [month] (mặc định tháng hiện tại).
  Future<PayEstimate> myEstimate({DateTime? month}) async {
    try {
      final res = await _client
          .rpc('my_pay_estimate',
              params: month == null ? <String, dynamic>{} : {'p_month': toSqlDate(month)})
          .timeout(_timeout);
      final rows = res as List;
      if (rows.isEmpty) throw AppException('Chưa có dữ liệu thu nhập.');
      return PayEstimate.fromJson(Map<String, dynamic>.from(rows.first as Map));
    } catch (e) {
      throw _map(e);
    }
  }

  /// Các phiếu đã công bố của tôi, mới nhất trước.
  Future<List<Payslip>> listMine() async {
    try {
      final rows = await _client
          .from('payslips')
          .select(Payslip.listColumns)
          .eq('employee_id', _uid)
          .eq('status', 'PUBLISHED')
          .order('period_start', ascending: false)
          .limit(60)
          .timeout(_timeout);
      return (rows as List)
          .map((r) => Payslip.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
    } catch (e) {
      throw _map(e);
    }
  }

  /// Một phiếu kèm chi tiết ca và các khoản cộng/trừ.
  Future<Payslip> getMine(String id) async {
    try {
      final row = await _client
          .from('payslips')
          .select('${Payslip.listColumns}, payslip_work_lines(*), payslip_items(*)')
          .eq('id', id)
          .eq('employee_id', _uid)
          .eq('status', 'PUBLISHED')
          .maybeSingle()
          .timeout(_timeout);
      if (row == null) throw AppException('Không tìm thấy phiếu lương này.');
      return Payslip.fromJson(Map<String, dynamic>.from(row));
    } catch (e) {
      throw _map(e);
    }
  }

  Future<void> acknowledge(String id) async {
    try {
      await _client.rpc('acknowledge_payslip', params: {'p_payslip_id': id}).timeout(_timeout);
    } catch (e) {
      throw _map(e);
    }
  }

  Future<void> dispute(String id, String note) async {
    try {
      await _client
          .rpc('dispute_payslip', params: {'p_payslip_id': id, 'p_note': note})
          .timeout(_timeout);
    } catch (e) {
      throw _map(e);
    }
  }

  AppException _map(Object e) => _payrollException(e);
}
