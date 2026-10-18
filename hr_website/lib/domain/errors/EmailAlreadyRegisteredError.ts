export class EmailAlreadyRegisteredError extends Error {
  // Sign-up is the one place where the caller is allowed to learn that an address is taken:
  // they chose it, and the screen offers "sign in instead" as the way out.
  constructor() {
    super("Email này đã có tài khoản đăng nhập.");
    this.name = "EmailAlreadyRegisteredError";
  }
}
