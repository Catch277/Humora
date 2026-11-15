import 'package:flutter_test/flutter_test.dart';

import 'package:hr_mobile_app/data/services/payroll_service.dart';

/// A payroll `raise exception 'TOKEN: …'` must become exactly one Vietnamese sentence, and the token has to
/// win over a shorter token it starts with — `PAYSLIP_NOT_FOUND` is a prefix of
/// `PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN`, which a `contains` match would get wrong (the trap the website's
/// `payrollErrors.ts` documents for `P0002`).
void main() {
  test('token dài thắng token ngắn cùng tiền tố', () {
    expect(
      payrollErrorText('PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN: the payslip has an open dispute'),
      payrollErrorMessages['PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN'],
    );
    expect(
      payrollErrorText('PAYSLIP_NOT_FOUND_OR_NOT_DRAFT'),
      payrollErrorMessages['PAYSLIP_NOT_FOUND_OR_NOT_DRAFT'],
    );
    expect(
      payrollErrorText('PAYSLIP_NOT_FOUND'),
      payrollErrorMessages['PAYSLIP_NOT_FOUND'],
    );
  });

  test('phần đuôi tiếng Anh của raise exception không lọt ra câu hiển thị', () {
    final text = payrollErrorText(
      'PAYSLIP_IMMUTABLE: a published payslip cannot be changed (state PUBLISHED)',
    );

    expect(text, payrollErrorMessages['PAYSLIP_IMMUTABLE']);
    expect(text, isNot(contains('PUBLISHED')));
  });

  test('thông báo không phải token trả null để toAppException xử lý', () {
    expect(payrollErrorText('JWT expired'), isNull);
    expect(payrollErrorText('new row violates check constraint "payslips_x"'), isNull);
    expect(payrollErrorText('   '), isNull);
  });

  test('mọi token của web đều có câu tiếng Việt', () {
    const tokens = [
      'AUTH_REQUIRED',
      'PAYROLL_OWNER_ONLY',
      'PAYROLL_NO_ORGANIZATION',
      'PAYROLL_AUDIT_APPEND_ONLY',
      'PAYROLL_EMPLOYEE_NOT_FOUND',
      'PAY_PROFILE_NOT_FOUND',
      'PAY_PROFILE_DUPLICATE',
      'PAYSLIP_NOT_FOUND',
      'PAYSLIP_NOT_FOUND_OR_NOT_DRAFT',
      'PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN',
      'PAYSLIP_ITEM_NOT_FOUND',
      'PAYSLIP_IMMUTABLE',
      'PAYSLIP_BAD_STATUS',
      'PAYSLIP_NO_OPEN_DISPUTE',
      'PAYROLL_FUTURE_PERIOD',
      'PAYROLL_PERIOD_NOT_FINISHED',
      'PAYSLIP_VOID_REASON_REQUIRED',
      'PAYSLIP_DISPUTE_NOTE_LENGTH',
      'PAYSLIP_DEDUCTIONS_EXCEED_GROSS',
      'PAYSLIP_TARGET_INVALID',
      'DEMO_PAY_NOT_FOUND',
      'DEMO_PAY_DUPLICATE',
      'DEMO_PAY_DEDUCTIONS_EXCEED_GROSS',
      'DEMO_PAY_POSITION_REQUIRED',
    ];

    for (final token in tokens) {
      expect(payrollErrorText('$token: something'), isNotNull, reason: token);
    }
  });
}
