import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';

class ApiService {
  late Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  ApiService._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(milliseconds: ApiConfig.connectTimeout),
      receiveTimeout: const Duration(milliseconds: ApiConfig.receiveTimeout),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    // Add interceptor for auth token & refresh
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Try to refresh token
          final refreshed = await _refreshToken();
          if (refreshed) {
            // Retry the request
            final opts = error.requestOptions;
            final token = await _storage.read(key: 'access_token');
            opts.headers['Authorization'] = 'Bearer $token';
            try {
              final response = await _dio.fetch(opts);
              return handler.resolve(response);
            } catch (e) {
              return handler.reject(error);
            }
          }
        }
        return handler.next(error);
      },
    ));
  }

  void updateBaseUrl(String url) {
    ApiConfig.baseUrl = url;
    _dio.options.baseUrl = url;
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) return false;

      final response = await Dio(BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        headers: {'Content-Type': 'application/json'},
      )).post(ApiConfig.refresh, data: {
        'refreshToken': refreshToken,
      });

      if (response.statusCode == 200) {
        final newToken = response.data['accessToken'];
        await _storage.write(key: 'access_token', value: newToken);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // Auth
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await _dio.post(ApiConfig.login, data: {
      'username': username,
      'password': password,
    });
    return response.data;
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    await _storage.write(key: 'access_token', value: accessToken);
    await _storage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'user_data');
    await _storage.delete(key: 'server_url');
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: 'access_token');
  }

  // ============================================================
  // Mobile API Endpoints (role-scoped, delivered-only)
  // ============================================================

  /// Dashboard: balance, invoice/payment/return stats
  Future<Map<String, dynamic>> getDashboard() async {
    final response = await _dio.get(ApiConfig.dashboard);
    return response.data;
  }

  /// Invoices list (delivered only, role-scoped)
  Future<Map<String, dynamic>> getInvoices({
    int page = 1,
    int limit = 50,
    String? customerId,
    String? fromDate,
    String? toDate,
    String? paymentStatus,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (customerId != null) params['customer_id'] = customerId;
    if (fromDate != null) params['from_date'] = fromDate;
    if (toDate != null) params['to_date'] = toDate;
    if (paymentStatus != null) params['payment_status'] = paymentStatus;
    if (search != null) params['search'] = search;

    final response = await _dio.get(ApiConfig.invoices, queryParameters: params);
    return response.data;
  }

  /// Single invoice with items
  Future<Map<String, dynamic>> getInvoice(String id) async {
    final response = await _dio.get(ApiConfig.invoiceDetail(id));
    return response.data;
  }

  /// Payments list (role-scoped)
  Future<Map<String, dynamic>> getPayments({
    int page = 1,
    int limit = 50,
    String? customerId,
    String? fromDate,
    String? toDate,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (customerId != null) params['customer_id'] = customerId;
    if (fromDate != null) params['from_date'] = fromDate;
    if (toDate != null) params['to_date'] = toDate;
    if (search != null) params['search'] = search;

    final response = await _dio.get(ApiConfig.payments, queryParameters: params);
    return response.data;
  }

  /// Sales returns list (role-scoped)
  Future<Map<String, dynamic>> getReturns({
    int page = 1,
    int limit = 50,
    String? customerId,
    String? fromDate,
    String? toDate,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (customerId != null) params['customer_id'] = customerId;
    if (fromDate != null) params['from_date'] = fromDate;
    if (toDate != null) params['to_date'] = toDate;
    if (search != null) params['search'] = search;

    final response = await _dio.get(ApiConfig.returns, queryParameters: params);
    return response.data;
  }

  /// Account statement (كشف حساب) with running balance
  Future<Map<String, dynamic>> getAccountStatement({
    String? customerId,
    String? fromDate,
    String? toDate,
  }) async {
    final params = <String, dynamic>{};
    if (customerId != null) params['customer_id'] = customerId;
    if (fromDate != null) params['from_date'] = fromDate;
    if (toDate != null) params['to_date'] = toDate;

    final response = await _dio.get(ApiConfig.accountStatement, queryParameters: params);
    return response.data;
  }

  /// Customers list (for sales reps/supervisors)
  Future<Map<String, dynamic>> getCustomers({
    int page = 1,
    int limit = 50,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (search != null) params['search'] = search;

    final response = await _dio.get(ApiConfig.customers, queryParameters: params);
    return response.data;
  }

  /// User profile + linked customer info
  Future<Map<String, dynamic>> getProfile() async {
    final response = await _dio.get(ApiConfig.profile);
    return response.data;
  }

  /// Notifications list with unread count
  Future<Map<String, dynamic>> getNotifications({
    int page = 1,
    int limit = 50,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    final response = await _dio.get(ApiConfig.notifications, queryParameters: params);
    return response.data;
  }

  /// Mark single notification as read
  Future<void> markNotificationRead(String id) async {
    await _dio.put(ApiConfig.notificationRead(id));
  }

  /// Mark all notifications as read
  Future<void> markAllNotificationsRead() async {
    await _dio.put(ApiConfig.notificationsReadAll);
  }

  /// Register FCM token for push notifications
  Future<void> registerFcmToken(String token, {String deviceType = 'android', String? deviceName}) async {
    await _dio.post(ApiConfig.fcmToken, data: {
      'token': token,
      'device_type': deviceType,
      'device_name': deviceName,
    });
  }

  /// Remove FCM token on logout
  Future<void> removeFcmToken(String token) async {
    await _dio.delete(ApiConfig.fcmToken, data: {'token': token});
  }

  // ============================================================
  // Generic helpers
  // ============================================================

  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) async {
    return await _dio.get(path, queryParameters: queryParameters);
  }

  Future<Response> post(String path, {dynamic data}) async {
    return await _dio.post(path, data: data);
  }
}
