import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';

import '../models/user.dart';

/// Each possible nav item with its permission key, route, icon, and label.
class _NavItem {
  final String permission;
  final String route;
  final IconData icon;
  final String label;
  /// Fallback permissions — if any of these exist, show the tab even without mobile_app.*.
  final List<String> fallbacks;
  const _NavItem({
    required this.permission,
    required this.route,
    required this.icon,
    required this.label,
    this.fallbacks = const [],
  });
}

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  /// All possible navigation items in display order.
  /// The permission string maps to mobile_app.* permissions.
  /// fallbacks are checked if mobile_app.* is missing (for legacy roles).
  static const _allNavItems = [
    _NavItem(permission: 'home', route: '/home', icon: LucideIcons.home, label: 'الرئيسية'),
    _NavItem(permission: 'invoices', route: '/invoices', icon: LucideIcons.fileText, label: 'الفواتير', fallbacks: ['invoices.view']),
    _NavItem(permission: 'payments', route: '/payments', icon: LucideIcons.creditCard, label: 'المدفوعات', fallbacks: ['payments.view']),
    _NavItem(permission: 'statement', route: '/statement', icon: LucideIcons.scrollText, label: 'كشف حساب', fallbacks: ['mobile_app.statement']),
    _NavItem(permission: 'supervisors', route: '/supervisors', icon: LucideIcons.shield, label: 'المشرفين'),
    _NavItem(permission: 'sales_reps', route: '/sales-reps', icon: LucideIcons.briefcase, label: 'المندوبين'),
    _NavItem(permission: 'customers', route: '/customers', icon: LucideIcons.users, label: 'العملاء', fallbacks: ['customers.view']),
  ];

  /// Items that can be hidden from the tab bar when there are too many (>5 total).
  /// These are still accessible via quick actions on home screen.
  static const _collapsiblePermissions = {'supervisors', 'sales_reps', 'customers'};

  // ── Customer: fixed navigation (no permission system) ──
  static const _customerRoutes = ['/home', '/invoices', '/payments', '/statement', '/notifications'];
  static const _customerDestinations = [
    NavigationDestination(icon: Icon(LucideIcons.home, size: 22), selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary), label: 'الرئيسية'),
    NavigationDestination(icon: Icon(LucideIcons.fileText, size: 22), selectedIcon: Icon(LucideIcons.fileText, size: 22, color: AppColors.primary), label: 'الفواتير'),
    NavigationDestination(icon: Icon(LucideIcons.creditCard, size: 22), selectedIcon: Icon(LucideIcons.creditCard, size: 22, color: AppColors.primary), label: 'المدفوعات'),
    NavigationDestination(icon: Icon(LucideIcons.scrollText, size: 22), selectedIcon: Icon(LucideIcons.scrollText, size: 22, color: AppColors.primary), label: 'كشف حساب'),
    NavigationDestination(icon: Icon(LucideIcons.bell, size: 22), selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary), label: 'الإشعارات'),
  ];

  bool _isCustomer(User? user) => user?.isCustomer ?? false;

  /// Check if user has permission for a nav item (mobile_app.* OR any fallback).
  bool _hasNavPermission(User user, _NavItem item) {
    if (user.hasPermission('mobile_app.${item.permission}')) return true;
    for (final fb in item.fallbacks) {
      if (user.hasPermission(fb)) return true;
    }
    return false;
  }

  /// Get the filtered nav items for this user, collapsing extras if > 5 tabs.
  List<_NavItem> _filteredNavItems(User user) {
    // First, collect all items the user has permission for
    final all = <_NavItem>[];
    for (final item in _allNavItems) {
      if (item.permission == 'home') continue;
      if (_hasNavPermission(user, item)) {
        all.add(item);
      }
    }
    // total = home + items + notifications
    final totalCount = 1 + all.length + 1;
    if (totalCount > 5) {
      // Remove collapsible items (they're in quick actions anyway)
      all.removeWhere((item) => _collapsiblePermissions.contains(item.permission));
    }
    return all;
  }

  /// Build routes list from permissions.
  List<String> _routes(User? user) {
    if (user == null) return ['/home', '/notifications'];
    if (_isCustomer(user)) return _customerRoutes;

    final items = _filteredNavItems(user);
    final routes = <String>['/home'];
    for (final item in items) {
      routes.add(item.route);
    }
    routes.add('/notifications');
    return routes;
  }

  /// Build destination widgets from permissions.
  List<NavigationDestination> _destinations(User? user) {
    if (user == null || _isCustomer(user)) return _customerDestinations;

    final items = _filteredNavItems(user);
    final dests = <NavigationDestination>[
      const NavigationDestination(
        icon: Icon(LucideIcons.home, size: 22),
        selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
        label: 'الرئيسية',
      ),
    ];

    for (final item in items) {
      dests.add(NavigationDestination(
        icon: Icon(item.icon, size: 22),
        selectedIcon: Icon(item.icon, size: 22, color: AppColors.primary),
        label: item.label,
      ));
    }

    dests.add(const NavigationDestination(
      icon: Icon(LucideIcons.bell, size: 22),
      selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
      label: 'الإشعارات',
    ));

    return dests;
  }

  int _currentIndex(BuildContext context, User? user) {
    final location = GoRouterState.of(context).matchedLocation;
    final r = _routes(user);
    for (int i = 0; i < r.length; i++) {
      if (location.startsWith(r[i])) return i;
    }
    return 0;
  }

  void _onTap(BuildContext context, int index, User? user) {
    final r = _routes(user);
    if (index < r.length) context.go(r[index]);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: NavigationBar(
              selectedIndex: _currentIndex(context, user),
              onDestinationSelected: (index) => _onTap(context, index, user),
              backgroundColor: Colors.transparent,
              elevation: 0,
              indicatorColor: AppColors.primary.withOpacity(0.12),
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: 64,
              destinations: _destinations(user),
            ),
          ),
        ),
      ),
    );
  }
}
