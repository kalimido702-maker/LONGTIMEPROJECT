import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  AuthProvider() {
    _api.setSessionExpiredHandler(_handleSessionExpired);
  }

  User? _user;
  bool _isLoading = false;
  String? _error;
  bool _isLoggedIn = false;
  List<Map<String, dynamic>> _linkedProfiles = [];

  User? get user => _user;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isLoggedIn => _isLoggedIn;
  List<Map<String, dynamic>> get linkedProfiles => _linkedProfiles;

  Future<void> _handleSessionExpired() async {
    await _api.clearTokens();
    _user = null;
    _isLoggedIn = false;
    _isLoading = false;
    _error = 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى';
    notifyListeners();
  }

  /// Try to restore session from saved tokens
  Future<bool> tryAutoLogin() async {
    try {
      final token = await _api.getAccessToken();
      final userData = await _storage.read(key: 'user_data');
      final serverUrl = await _storage.read(key: 'server_url');

      if (serverUrl != null && serverUrl.isNotEmpty) {
        _api.updateBaseUrl(serverUrl);
      }

      if (token != null && userData != null) {
        _user = User.fromJson(json.decode(userData));
        _isLoggedIn = true;
        notifyListeners();

        // Register FCM token after auto-login
        NotificationService().registerToken();

        // Load linked profiles in background
        loadLinkedProfiles().catchError((_) {});

        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  void updateLocalUsername(String newUsername) async {
    if (_user != null) {
      _user = User(
        id: _user!.id,
        username: newUsername,
        fullName: _user!.fullName,
        role: _user!.role,
        clientId: _user!.clientId,
        branchId: _user!.branchId,
        permissions: _user!.permissions,
      );
      notifyListeners();

      final currentUserDataStr = await _storage.read(key: 'user_data');
      if (currentUserDataStr != null) {
        final Map<String, dynamic> currentUserData = json.decode(currentUserDataStr);
        currentUserData['username'] = newUsername;
        await _storage.write(key: 'user_data', value: json.encode(currentUserData));
      }
    }
  }

  Future<bool> login(
    String username,
    String password, {
    String? serverUrl,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      if (serverUrl != null && serverUrl.isNotEmpty) {
        // Ensure URL has /api suffix
        String url = serverUrl.trim();
        if (!url.startsWith('http')) url = 'http://$url';
        if (!url.endsWith('/api')) {
          url = url.endsWith('/') ? '${url}api' : '$url/api';
        }
        _api.updateBaseUrl(url);
        await _storage.write(key: 'server_url', value: url);
      }

      final response = await _api.login(username, password);

      final accessToken = response['accessToken'];
      final refreshToken = response['refreshToken'];
      final userData = response['user'];

      await _api.saveTokens(accessToken, refreshToken);
      await _storage.write(key: 'user_data', value: json.encode(userData));

      _user = User.fromJson(userData);
      _isLoggedIn = true;
      _isLoading = false;
      notifyListeners();

      // Register FCM token after login
      NotificationService().registerToken();

      // Load linked profiles in background
      loadLinkedProfiles().catchError((_) {});

      return true;
    } catch (e) {
      _isLoading = false;
      if (e.toString().contains('401')) {
        _error = 'اسم المستخدم أو كلمة المرور غير صحيحة';
      } else if (e.toString().contains('403')) {
        _error = 'الحساب غير مفعل';
      } else if (e.toString().contains('SocketException') ||
          e.toString().contains('timeout')) {
        _error = 'لا يمكن الاتصال بالسيرفر. تحقق من عنوان السيرفر والإنترنت';
      } else {
        _error = 'حدث خطأ أثناء تسجيل الدخول';
      }
      notifyListeners();
      return false;
    }
  }

  Future<void> loadLinkedProfiles() async {
    try {
      final response = await _api.getLinkedProfiles();
      _linkedProfiles = List<Map<String, dynamic>>.from(response['data'] ?? []);
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to load linked profiles: $e');
    }
  }

  Future<bool> switchProfile(String targetUserId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.switchProfile(targetUserId);

      final accessToken = response['accessToken'];
      final refreshToken = response['refreshToken'];
      final userData = response['user'];

      await _api.saveTokens(accessToken, refreshToken);
      await _storage.write(key: 'user_data', value: json.encode(userData));

      _user = User.fromJson(userData);
      _isLoading = false;
      
      // Reload linked profiles after switch
      await loadLinkedProfiles();
      
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      if (e.toString().contains('403')) {
        _error = 'غير مصرح لك بالتبديل لهذا الحساب';
      } else {
        _error = 'حدث خطأ أثناء تبديل الحساب';
      }
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await NotificationService().unregisterToken();
    } catch (_) {}

    await _api.clearTokens();
    _user = null;
    _isLoggedIn = false;
    _error = null;
    _linkedProfiles = [];
    notifyListeners();
  }

  @override
  void dispose() {
    _api.setSessionExpiredHandler(null);
    super.dispose();
  }
}
