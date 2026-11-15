import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart'; // Để dùng kIsWeb
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';

class CameraCheckInScreen extends StatefulWidget {
  final bool isCheckingIn;

  const CameraCheckInScreen({super.key, required this.isCheckingIn});

  @override
  State<CameraCheckInScreen> createState() => _CameraCheckInScreenState();
}

class _CameraCheckInScreenState extends State<CameraCheckInScreen> {
  CameraController? _controller;
  Future<void>? _initializeControllerFuture;
  String _ipAddress = 'Đang lấy IP...';
  bool _isCapturing = false;
  bool _isWebMode = kIsWeb; // Kiểm tra có đang chạy Web hay không

  @override
  void initState() {
    super.initState();
    if (!_isWebMode) {
      _initCamera();
    }
    _fetchIpAddress();
  }

  // Khởi tạo camera trên thiết bị di động
  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return;

      final frontCamera = cameras.firstWhere(
        (cam) => cam.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      _controller = CameraController(
        frontCamera,
        ResolutionPreset.medium,
        enableAudio: false,
      );

      _initializeControllerFuture = _controller!.initialize();
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Lỗi khởi tạo camera: $e');
    }
  }

  // Lấy IP Public
  Future<void> _fetchIpAddress() async {
    try {
      final response = await http.get(Uri.parse('https://api.ipify.org?format=json'));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (mounted) {
          setState(() {
            _ipAddress = data['ip'] ?? '127.0.0.1';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _ipAddress = '127.0.0.1 (Web Local)';
        });
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  // Hàm chụp ảnh / Xác nhận check-in
  Future<void> _takePicture() async {
    if (_isCapturing) return;
    setState(() => _isCapturing = true);

    try {
      String imagePath = 'web_mock_image';
      Uint8List? bytes;

      // Nếu chạy trên điện thoại/máy ảo thì chụp ảnh thực từ Camera
      if (!_isWebMode && _controller != null && _controller!.value.isInitialized) {
        await _initializeControllerFuture;
        final image = await _controller!.takePicture();
        imagePath = image.path;
        // Đọc bytes ngay tại đây để màn hình chấm công tải ảnh lên Supabase Storage (SCRUM-95).
        // Đọc lỗi thì vẫn chấm công được, chỉ thiếu ảnh.
        try {
          bytes = await image.readAsBytes();
        } catch (e) {
          debugPrint('Không đọc được ảnh vừa chụp: $e');
        }
      }

      final now = DateTime.now();
      final timeStr = DateFormat('hh:mm a').format(now);

      if (mounted) {
        // Trả kết quả về cho màn hình Home
        Navigator.pop(context, <String, dynamic>{
          'time': timeStr,
          'imagePath': imagePath,
          'ip': _ipAddress,
          'bytes': bytes,
        });
      }
    } catch (e) {
      debugPrint('Lỗi khi chụp: $e');
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nowStr = DateFormat('HH:mm:ss - dd/MM/yyyy').format(DateTime.now());

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // 1. Hiển thị Khung Camera (Android/iOS) hoặc Khung xem giả lập (Web)
            _isWebMode
                ? Center(
                    child: Container(
                      width: 400,
                      height: 500,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade900,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white24),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: const [
                          Icon(Icons.web_rounded, color: Colors.blueAccent, size: 64),
                          SizedBox(height: 16),
                          Text(
                            'Đang chạy trên môi trường Web',
                            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Sử dụng chế độ mô phỏng xác thực Check-in/Check-out',
                            style: TextStyle(color: Colors.white60, fontSize: 12),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  )
                : FutureBuilder<void>(
                    future: _initializeControllerFuture,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.done &&
                          _controller != null &&
                          _controller!.value.isInitialized) {
                        return Center(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(20),
                            child: CameraPreview(_controller!),
                          ),
                        );
                      } else {
                        return const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        );
                      }
                    },
                  ),

            // 2. Thẻ hiển thị thông tin đè lên màn hình
            Positioned(
              top: 20,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.7),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white24),
                ),
                child: Column(
                  children: [
                    Text(
                      widget.isCheckingIn ? 'XÁC THỰC VÀO CA' : 'XÁC THỰC RA CA',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.access_time, color: Colors.greenAccent, size: 14),
                        const SizedBox(width: 6),
                        Text(
                          nowStr,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi, color: Colors.blueAccent, size: 14),
                        const SizedBox(width: 6),
                        Text(
                          'IP: $_ipAddress',
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // 3. Nút quay lại (Back)
            Positioned(
              top: 20,
              left: 16,
              child: IconButton(
                icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
            ),

            // 4. Nút bấm Chụp ảnh / Xác nhận
            Positioned(
              bottom: 30,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: _takePicture,
                  child: Container(
                    height: 76,
                    width: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                      color: _isCapturing ? Colors.grey : const Color(0xFF3B82F6),
                    ),
                    child: const Icon(
                      Icons.camera_alt,
                      color: Colors.white,
                      size: 36,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}