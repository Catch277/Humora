/**
 * A đơn that acts on a day is missing what it needs, or asks for a day that cannot be acted on
 * (SCRUM-82/83).
 *
 * Three cases, all of them the caller's mistake and all answered `400`: no date on a "Nghỉ phép" /
 * "Đổi ca" / "Điều chỉnh công" đơn, a date in the past, or a "Đổi ca" đơn without the ca and the
 * colleague who takes it. The message is Vietnamese because the screen shows it verbatim (the route
 * passes `error.message` through) — the app checks the same rules first, and the
 * `requests_guard_shift_details` trigger (SQLSTATE `23P03` / `23P05`) is the backstop for the writers
 * that check cannot see.
 */
export class RequestShiftDetailsError extends Error {
  constructor(message = "Đơn này cần có ngày áp dụng.") {
    super(message);
    this.name = "RequestShiftDetailsError";
  }
}
