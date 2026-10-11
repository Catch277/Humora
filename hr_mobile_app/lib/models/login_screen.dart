import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../routes/app_routers.dart';

// Biến toàn cục lấy client Supabase
final supabase = Supabase.instance.client;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  // Controllers cho Email & Password
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _rememberMe = false;
  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    ));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // 1. Hàm Đăng nhập thực tế với Supabase
  Future<void> _loginWithSupabase() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showSnackBar('Vui lòng nhập đầy đủ Email và Mật khẩu!', Colors.orangeAccent);
      return;
    }

    setState(() => _isLoading = true);

    try {
      // Gọi API Đăng nhập của Supabase
      final response = await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      if (response.user != null) {
        if (!mounted) return;
        _showSnackBar('Đăng nhập thành công!', const Color(0xFF10B981));

        // Chuyển tới màn hình Home Employee
        Navigator.pushReplacementNamed(context, AppRoutes.home_employee);
      }
    } on AuthException catch (e) {
      _showSnackBar(e.message, Colors.redAccent);
    } catch (e) {
      _showSnackBar('Đã có lỗi xảy ra: $e', Colors.redAccent);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // 2. Hàm Tự động tạo 1 tài khoản mới trên Supabase và điền tự động
  Future<void> _autoCreateAccountAndFill() async {
    setState(() => _isLoading = true);

    // Tạo email & password ngẫu nhiên dạng nv_1234@company.com
    final randomId = DateTime.now().millisecondsSinceEpoch.toString().substring(8);
    final autoEmail = 'employee_$randomId@company.com';
    const autoPassword = 'password123';

    try {
      // Gọi API Đăng ký tài khoản trên Supabase
      final response = await supabase.auth.signUp(
        email: autoEmail,
        password: autoPassword,
      );

      if (response.user != null) {
        // Tự động điền thông tin vừa tạo vào 2 ô TextField
        _emailController.text = autoEmail;
        _passwordController.text = autoPassword;

        if (!mounted) return;
        _showSnackBar(
          'Đã tự tạo tài khoản thành công trên Supabase!\nEmail: $autoEmail',
          const Color(0xFF2563EB),
        );
      }
    } on AuthException catch (e) {
      _showSnackBar(e.message, Colors.redAccent);
    } catch (e) {
      _showSnackBar('Lỗi tự tạo tài khoản: $e', Colors.redAccent);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showSnackBar(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFFE9EEF9),
      body: Stack(
        children: [
          // Background Gradient Spheres (Trang trí hiệu ứng nền bóng mờ)
          Positioned(
            top: -60,
            left: -60,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    Colors.white.withOpacity(0.9),
                    const Color(0xFFC7D7F8).withOpacity(0.4),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: size.height * 0.18,
            right: -50,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    Colors.white.withOpacity(0.8),
                    const Color(0xFFC7D7F8).withOpacity(0.3),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -50,
            right: -30,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF2563EB).withOpacity(0.2),
                    Colors.white.withOpacity(0.5),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // Top Header Icon (Chế độ ban đêm / Icon moon)
          Positioned(
            top: 50,
            right: 24,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFFE0E7F5),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.white.withOpacity(0.8),
                    offset: const Offset(-4, -4),
                    blurRadius: 8,
                  ),
                  BoxShadow(
                    color: const Color(0xFFA6B4C9).withOpacity(0.5),
                    offset: const Offset(4, 4),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: const Icon(Icons.nightlight_round, color: Color(0xFF1E293B), size: 20),
            ),
          ),

          // Nội dung Form Đăng Nhập
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                child: SlideTransition(
                  position: _slideAnimation,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 10),
                      
                      // Logo bg.png
Container(
  width: 130,
  height: 130,
  padding: const EdgeInsets.all(16), // Khoảng lề giúp ảnh nằm gọn đẹp trong thẻ
  decoration: BoxDecoration(
    color: const Color(0xFFE9EEF9),
    borderRadius: BorderRadius.circular(36),
    boxShadow: [
      BoxShadow(
        color: Colors.white.withOpacity(0.9),
        offset: const Offset(-8, -8),
        blurRadius: 16,
      ),
      BoxShadow(
        color: const Color(0xFFA6B4C9).withOpacity(0.5),
        offset: const Offset(8, 8),
        blurRadius: 16,
      ),
    ],
  ),
  child: ClipRRect(
    borderRadius: BorderRadius.circular(24),
    child: Image.asset(
      'assets/images/bg.png',
      fit: BoxFit.cover,
    ),
  ),
),
                      const SizedBox(height: 28),

                      // Tiêu đề Welcome Back
                      const Text(
                        'Welcome Back',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Sign in to continue',
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xFF64748B),
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Ô nhập Email / Username
                      _buildNeumorphicInput(
                        controller: _emailController,
                        hintText: 'Username or Email',
                        icon: Icons.person_outline_rounded,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 18),

                      // Ô nhập Mật khẩu
                      _buildNeumorphicInput(
                        controller: _passwordController,
                        hintText: 'Password',
                        icon: Icons.lock_outline_rounded,
                        obscureText: _obscurePassword,
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            color: const Color(0xFF64748B),
                            size: 20,
                          ),
                          onPressed: () {
                            setState(() {
                              _obscurePassword = !_obscurePassword;
                            });
                          },
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Hàng Remember me & Forgot Password
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _rememberMe = !_rememberMe;
                                  });
                                },
                                child: Container(
                                  width: 22,
                                  height: 22,
                                  decoration: BoxDecoration(
                                    color: _rememberMe
                                        ? const Color(0xFF2563EB)
                                        : const Color(0xFFE9EEF9),
                                    borderRadius: BorderRadius.circular(6),
                                    boxShadow: _rememberMe
                                        ? []
                                        : [
                                            BoxShadow(
                                              color: Colors.white.withOpacity(0.8),
                                              offset: const Offset(-2, -2),
                                              blurRadius: 4,
                                            ),
                                            BoxShadow(
                                              color: const Color(0xFFA6B4C9).withOpacity(0.5),
                                              offset: const Offset(2, 2),
                                              blurRadius: 4,
                                            ),
                                          ],
                                  ),
                                  child: _rememberMe
                                      ? const Icon(Icons.check, size: 16, color: Colors.white)
                                      : null,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                'Remember Me',
                                style: TextStyle(
                                  color: Color(0xFF334155),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                          TextButton(
                            onPressed: () {},
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: const Text(
                              'Forgot Password?',
                              style: TextStyle(
                                color: Color(0xFF2563EB),
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),

                      // Nút Đăng nhập Gradient Neumorphism
                      Container(
                        width: double.infinity,
                        height: 56,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(28),
                          gradient: const LinearGradient(
                            colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF2563EB).withOpacity(0.4),
                              offset: const Offset(0, 8),
                              blurRadius: 16,
                            ),
                          ],
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(28),
                            onTap: _isLoading ? null : _loginWithSupabase,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Spacer(),
                                  _isLoading
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text(
                                          'Login',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.2),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.arrow_forward_rounded,
                                      color: Colors.white,
                                      size: 18,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      

                      // Text Footer
                      const Text(
                        'NHÂN SỰ  •  CHẤM CÔNG  •  TĂNG TRƯỞNG',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF94A3B8),
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Widget ô Nhập Liệu Neumorphism (Đã sửa lỗi inset)
  Widget _buildNeumorphicInput({
    required TextEditingController controller,
    required String hintText,
    required IconData icon,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
    Widget? suffixIcon,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFE9EEF9),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withOpacity(0.9),
            offset: const Offset(-4, -4),
            blurRadius: 8,
          ),
          BoxShadow(
            color: const Color(0xFFA6B4C9).withOpacity(0.4),
            offset: const Offset(4, 4),
            blurRadius: 8,
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: const TextStyle(color: Color(0xFF0F172A), fontSize: 15),
        decoration: InputDecoration(
          hintText: hintText,
          hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
          prefixIcon: Icon(icon, color: const Color(0xFF64748B), size: 22),
          suffixIcon: suffixIcon,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        ),
      ),
    );
  }
}