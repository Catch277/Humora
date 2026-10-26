import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/format.dart';
import '../models/payslip.dart';
import 'api_error.dart';

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

  AppException _map(Object e) => toAppException(e, known: _known);

  static const Map<String, String> _known = {
    'PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN':
        'Không gửi được: phiếu không tồn tại hoặc đã có thắc mắc đang chờ xử lý.',
    'PAYSLIP_NOT_FOUND': 'Không tìm thấy phiếu lương này.',
    'PAYSLIP_DISPUTE_NOTE_LENGTH': 'Nội dung thắc mắc cần từ 5 đến 500 ký tự.',
    'AUTH_REQUIRED': 'Bạn cần đăng nhập lại.',
  };
}
