export class TooManyJoinAttemptsError extends Error {
  constructor() {
    super("Bạn đã thử tham gia quá nhiều lần. Hãy thử lại sau một giờ.");
    this.name = "TooManyJoinAttemptsError";
  }
}