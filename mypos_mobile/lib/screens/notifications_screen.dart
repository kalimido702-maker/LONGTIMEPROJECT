import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<_NotificationItem> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadNotifications());
  }

  Future<void> _loadNotifications() async {
    final dataProvider = context.read<DataProvider>();
    final result = await dataProvider.loadNotifications();

    if (mounted) {
      final data = result['data'] as List? ?? [];
      setState(() {
        _notifications = data.map((n) {
          final json = n as Map<String, dynamic>;
          DateTime? date;
          try {
            date = DateTime.parse(json['created_at'] ?? '');
          } catch (_) {
            date = DateTime.now();
          }
          return _NotificationItem(
            id: json['id']?.toString() ?? '',
            title: json['title'] ?? '',
            body: json['body'] ?? '',
            type: json['type'] ?? 'info',
            date: date,
            isRead: json['is_read'] == 1 || json['is_read'] == true,
          );
        }).toList();
        _unreadCount = result['unread'] is int ? result['unread'] : 0;
        _isLoading = false;
      });
    }
  }

  Future<void> _markAllRead() async {
    final dataProvider = context.read<DataProvider>();
    await dataProvider.markAllNotificationsRead();
    setState(() {
      for (var n in _notifications) {
        n.isRead = true;
      }
      _unreadCount = 0;
    });
  }

  Future<void> _markRead(String id) async {
    final dataProvider = context.read<DataProvider>();
    await dataProvider.markNotificationRead(id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_unreadCount > 0 ? 'الإشعارات ($_unreadCount)' : 'الإشعارات'),
        actions: [
          if (_notifications.any((n) => !n.isRead))
            TextButton(
              onPressed: _markAllRead,
              child: const Text(
                'قراءة الكل',
                style: TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _notifications.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  color: AppColors.primary,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _notifications.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final notification = _notifications[index];
                      return _NotificationCard(
                        notification: notification,
                        onTap: () {
                          if (!notification.isRead) {
                            _markRead(notification.id);
                            setState(() {
                              notification.isRead = true;
                              _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
                            });
                          }
                        },
                        onDismiss: () {
                          setState(() {
                            if (!notification.isRead) {
                              _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
                            }
                            _notifications.removeAt(index);
                          });
                        },
                      );
                    },
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.bellOff, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا توجد إشعارات',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.grey[500]),
          ),
          const SizedBox(height: 8),
          Text(
            'ستظهر الإشعارات هنا عند وصولها',
            style: TextStyle(fontSize: 14, color: Colors.grey[400]),
          ),
        ],
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final _NotificationItem notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color iconColor;
    switch (notification.type) {
      case 'invoice':
        icon = LucideIcons.fileText;
        iconColor = AppColors.secondary;
        break;
      case 'payment':
        icon = LucideIcons.creditCard;
        iconColor = AppColors.success;
        break;
      case 'return':
        icon = LucideIcons.rotateCcw;
        iconColor = AppColors.warning;
        break;
      case 'alert':
        icon = LucideIcons.alertTriangle;
        iconColor = AppColors.error;
        break;
      default:
        icon = LucideIcons.bell;
        iconColor = AppColors.primary;
    }

    final timeAgo = _getTimeAgo(notification.date);

    return Dismissible(
      key: Key(notification.hashCode.toString()),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDismiss(),
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        decoration: BoxDecoration(
          color: AppColors.error.withOpacity(0.1),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(LucideIcons.trash2, color: AppColors.error),
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: notification.isRead ? Colors.white : AppColors.primary.withOpacity(0.04),
            borderRadius: BorderRadius.circular(14),
            border: notification.isRead
                ? null
                : Border.all(color: AppColors.primary.withOpacity(0.15)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.03),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: iconColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 20, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: TextStyle(
                              fontWeight: notification.isRead ? FontWeight.w500 : FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (!notification.isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: AppColors.primary,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      notification.body,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[600],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      timeAgo,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey[400],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getTimeAgo(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    return '${date.year}/${date.month}/${date.day}';
  }
}

class _NotificationItem {
  final String id;
  final String title;
  final String body;
  final String type;
  final DateTime date;
  bool isRead;

  _NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.date,
    required this.isRead,
  });
}
