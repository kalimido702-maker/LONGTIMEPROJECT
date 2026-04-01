class ApiConfig {
  // Default server URL - can be changed from login screen
  static String baseUrl = 'http://13coffee.net:3030/api';

  // Auth endpoints
  static const String login = '/auth/login';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';

  // Mobile endpoints (role-scoped, delivered-only)
  static const String dashboard = '/mobile/dashboard';
  static const String invoices = '/mobile/invoices';
  static String invoiceDetail(String id) => '/mobile/invoices/$id';
  static const String payments = '/mobile/payments';
  static const String returns = '/mobile/returns';
  static const String accountStatement = '/mobile/account-statement';
  static const String customers = '/mobile/customers';
  static const String salesReps = '/mobile/sales-reps';
  static const String supervisors = '/mobile/supervisors';
  static const String profile = '/mobile/profile';
  static const String priceList = '/mobile/price-list';
  static const String notifications = '/mobile/notifications';
  static String notificationRead(String id) => '/mobile/notifications/$id/read';
  static const String notificationsReadAll = '/mobile/notifications/read-all';
  static const String fcmToken = '/mobile/fcm-token';

  // Legacy endpoints (for fallback/compatibility)
  static const String invoiceStats = '/invoices/stats/summary';
  static String customerBalance(String id) => '/customers/$id/balance';
  static const String syncPull = '/sync/pull-changes';
  static const String syncPush = '/sync/batch-push';
  static String syncRecord(String table, String id) => '/sync/record/$table/$id';

  // Timeouts
  static const int connectTimeout = 15000;
  static const int receiveTimeout = 30000;
}
