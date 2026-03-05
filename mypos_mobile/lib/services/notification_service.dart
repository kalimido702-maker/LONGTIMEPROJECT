import 'dart:convert';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import '../firebase_options.dart';
import '../config/router.dart';
import 'api_service.dart';

/// Background message handler — must be top-level function
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await NotificationService._showLocalNotification(message);
}

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  late final FirebaseMessaging _messaging;
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  String? _fcmToken;
  String? get fcmToken => _fcmToken;

  /// Initialize Firebase + FCM + local notifications
  Future<void> initialize() async {
    // Initialize Firebase
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    // Initialize messaging after Firebase is ready
    _messaging = FirebaseMessaging.instance;

    // Request permission
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return;
    }

    // Setup local notifications (for foreground display)
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );


    // Create Android notification channel
    if (Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        'mypos_notifications',
        'إشعارات التطبيق',
        description: 'إشعارات فواتير ومدفوعات MyPOS',
        importance: Importance.high,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
    }

    // Register background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Listen for foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification taps when app was terminated
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      // Delay to allow router to be ready
      Future.delayed(const Duration(seconds: 2), () {
        _handleNotificationNavigation(initialMessage.data);
      });
    }

    // Handle notification taps when app was in background
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _handleNotificationNavigation(message.data);
    });

    // Get FCM token
    _fcmToken = await _messaging.getToken();

    // Listen for token refresh
    _messaging.onTokenRefresh.listen((newToken) {
      _fcmToken = newToken;
      _registerTokenOnServer(newToken);
    });
  }

  /// Register FCM token with the backend
  Future<void> registerToken() async {
    if (_fcmToken == null) return;
    await _registerTokenOnServer(_fcmToken!);
  }

  Future<void> _registerTokenOnServer(String token) async {
    try {
      final api = ApiService();
      await api.registerFcmToken(token, deviceType: Platform.isAndroid ? 'android' : 'ios');
    } catch (_) {
      // Silently fail — will retry on next app open
    }
  }

  /// Unregister FCM token on logout
  Future<void> unregisterToken() async {
    if (_fcmToken == null) return;
    try {
      final api = ApiService();
      await api.removeFcmToken(_fcmToken!);
    } catch (_) {}
  }

  /// Handle foreground message — show local notification
  void _handleForegroundMessage(RemoteMessage message) {
    _showLocalNotification(message);
  }

  /// Show a local notification from a RemoteMessage
  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    const androidDetails = AndroidNotificationDetails(
      'mypos_notifications',
      'إشعارات التطبيق',
      channelDescription: 'إشعارات فواتير ومدفوعات MyPOS',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      details,
      payload: json.encode(message.data),
    );
  }

  /// Handle notification tap
  static void _onNotificationTapped(NotificationResponse response) {
    if (response.payload != null) {
      try {
        final data = json.decode(response.payload!);
        _handleNotificationNavigation(data);
      } catch (_) {}
    }
  }

  /// Navigate based on notification data
  static void _handleNotificationNavigation(Map<String, dynamic> data) {
    final type = data['type'] as String? ?? '';
    final referenceId = data['referenceId'] as String? ?? '';
    // referenceType available in data['referenceType'] if needed

    final context = rootNavigatorKey.currentContext;
    if (context == null) return;

    switch (type) {
      case 'invoice':
        if (referenceId.isNotEmpty) {
          GoRouter.of(context).go('/invoices?filterId=$referenceId');
        } else {
          GoRouter.of(context).go('/invoices');
        }
        break;
      case 'payment':
        if (referenceId.isNotEmpty) {
          GoRouter.of(context).go('/payments?filterId=$referenceId');
        } else {
          GoRouter.of(context).go('/payments');
        }
        break;
      case 'return':
        if (referenceId.isNotEmpty) {
          GoRouter.of(context).go('/returns?filterId=$referenceId');
        } else {
          GoRouter.of(context).go('/returns');
        }
        break;
      default:
        GoRouter.of(context).go('/notifications');
        break;
    }
  }
}
