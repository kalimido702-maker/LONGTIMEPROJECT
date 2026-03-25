import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';

import '../models/user.dart';

/// Determines which navigation variant to show based on user role.
enum _NavVariant { customer, salesRep, supervisor, admin, employee, generalManager, salesManager }

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  _NavVariant _variant(String? role) {
    switch (role) {
      case 'admin':
        return _NavVariant.admin;
      case 'مدير النظام':
        return _NavVariant.admin;
      case 'supervisor':
        return _NavVariant.supervisor;
      case 'sales_rep':
      case 'salesRep':
      case 'salesman':
        return _NavVariant.salesRep;
      case 'customer':
        return _NavVariant.customer;
      case 'general_manager':
        return _NavVariant.generalManager;
      case 'sales_manager':
        return _NavVariant.salesManager;
      default:
        return _NavVariant.employee;
    }
  }

  // ---------- Routes per role ----------
  static const _customerRoutes = [
    '/home',
    '/invoices',
    '/payments',
    '/statement',
    '/notifications',
  ];
  static const _salesRepRoutes = ['/home', '/customers', '/notifications'];
  static const _supervisorRoutes = [
    '/home',
    '/sales-reps',
    '/customers',
    '/notifications',
  ];
  static const _adminRoutes = [
    '/home',
    '/supervisors',
    '/sales-reps',
    '/customers',
    '/notifications',
  ];
  static const _generalManagerRoutes = [
    '/home',
    '/supervisors',
    '/sales-reps',
    '/customers',
    '/invoices',
    '/payments',
  ];
  static const _salesManagerRoutes = ['/home', '/invoices'];

  List<String> _routes(BuildContext context, _NavVariant v, User? user) {
    if (v == _NavVariant.employee && user != null) {
      final routes = <String>[];
      // Home is always available if they can log in
      routes.add('/home');
      if (user.hasPermission('mobile_app.invoices') ||
          user.hasPermission('invoices.view'))
        routes.add('/invoices');
      if (user.hasPermission('mobile_app.payments') ||
          user.hasPermission('payments.view'))
        routes.add('/payments');
      if (user.hasPermission('mobile_app.statement') ||
          user.hasPermission('customers.view'))
        routes.add('/customers');
      routes.add('/notifications');
      if (routes.length == 1) routes.insert(0, '/home'); // Fallback
      return routes;
    }

    switch (v) {
      case _NavVariant.admin:
        return _adminRoutes;
      case _NavVariant.supervisor:
        return _supervisorRoutes;
      case _NavVariant.salesRep:
        return _salesRepRoutes;
      case _NavVariant.customer:
        return _customerRoutes;
      case _NavVariant.generalManager:
        return _generalManagerRoutes;
      case _NavVariant.salesManager:
        return _salesManagerRoutes;
      case _NavVariant.employee:
        return _customerRoutes; // Fallback
    }
  }

  int _currentIndex(BuildContext context, _NavVariant v, User? user) {
    final location = GoRouterState.of(context).matchedLocation;
    final r = _routes(context, v, user);
    for (int i = 0; i < r.length; i++) {
      if (location.startsWith(r[i])) return i;
    }
    return 0;
  }

  void _onTap(BuildContext context, int index, _NavVariant v, User? user) {
    final r = _routes(context, v, user);
    if (index < r.length) context.go(r[index]);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final v = _variant(user?.role);

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
              selectedIndex: _currentIndex(context, v, user),
              onDestinationSelected: (index) => _onTap(context, index, v, user),
              backgroundColor: Colors.transparent,
              elevation: 0,
              indicatorColor: AppColors.primary.withOpacity(0.12),
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: 64,
              destinations: _destinations(context, v, user),
            ),
          ),
        ),
      ),
    );
  }

  List<NavigationDestination> _destinations(
    BuildContext context,
    _NavVariant v,
    User? user,
  ) {
    if (v == _NavVariant.employee && user != null) {
      final dests = <NavigationDestination>[];
      // Home is always available if they can log in
      dests.add(
        const NavigationDestination(
          icon: Icon(LucideIcons.home, size: 22),
          selectedIcon: Icon(
            LucideIcons.home,
            size: 22,
            color: AppColors.primary,
          ),
          label: 'الرئيسية',
        ),
      );
      if (user.hasPermission('mobile_app.invoices') ||
          user.hasPermission('invoices.view')) {
        dests.add(
          const NavigationDestination(
            icon: Icon(LucideIcons.fileText, size: 22),
            selectedIcon: Icon(
              LucideIcons.fileText,
              size: 22,
              color: AppColors.primary,
            ),
            label: 'الفواتير',
          ),
        );
      }
      if (user.hasPermission('mobile_app.payments') ||
          user.hasPermission('payments.view')) {
        dests.add(
          const NavigationDestination(
            icon: Icon(LucideIcons.creditCard, size: 22),
            selectedIcon: Icon(
              LucideIcons.creditCard,
              size: 22,
              color: AppColors.primary,
            ),
            label: 'المدفوعات',
          ),
        );
      }
      if (user.hasPermission('mobile_app.statement') ||
          user.hasPermission('customers.view')) {
        dests.add(
          const NavigationDestination(
            icon: Icon(LucideIcons.users, size: 22),
            selectedIcon: Icon(
              LucideIcons.users,
              size: 22,
              color: AppColors.primary,
            ),
            label: 'العملاء',
          ),
        );
      }
      dests.add(
        const NavigationDestination(
          icon: Icon(LucideIcons.bell, size: 22),
          selectedIcon: Icon(
            LucideIcons.bell,
            size: 22,
            color: AppColors.primary,
          ),
          label: 'الإشعارات',
        ),
      );

      if (dests.length == 1) {
        // Only notifications
        dests.insert(
          0,
          const NavigationDestination(
            icon: Icon(LucideIcons.home, size: 22),
            selectedIcon: Icon(
              LucideIcons.home,
              size: 22,
              color: AppColors.primary,
            ),
            label: 'الرئيسية',
          ),
        );
      }
      return dests;
    }

    switch (v) {
      case _NavVariant.customer:
        return _customerDestinations;
      case _NavVariant.salesRep:
        return _salesRepDestinations;
      case _NavVariant.supervisor:
        return _supervisorDestinations;
      case _NavVariant.admin:
        return _adminDestinations;
      case _NavVariant.generalManager:
        return _generalManagerDestinations;
      case _NavVariant.salesManager:
        return _salesManagerDestinations;
      case _NavVariant.employee:
        return _customerDestinations; // Fallback
    }
  }

  // ── Customer: الرئيسية | الفواتير | المدفوعات | كشف حساب | الإشعارات
  static const _customerDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.fileText, size: 22),
      selectedIcon: Icon(
        LucideIcons.fileText,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'الفواتير',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.creditCard, size: 22),
      selectedIcon: Icon(
        LucideIcons.creditCard,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المدفوعات',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.scrollText, size: 22),
      selectedIcon: Icon(
        LucideIcons.scrollText,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'كشف حساب',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.bell, size: 22),
      selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
      label: 'الإشعارات',
    ),
  ];

  // ── Sales Rep: الرئيسية | العملاء | الإشعارات
  static const _salesRepDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.users, size: 22),
      selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary),
      label: 'العملاء',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.bell, size: 22),
      selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
      label: 'الإشعارات',
    ),
  ];

  // ── Supervisor: الرئيسية | المندوبين | العملاء | الإشعارات
  static const _supervisorDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.briefcase, size: 22),
      selectedIcon: Icon(
        LucideIcons.briefcase,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المندوبين',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.users, size: 22),
      selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary),
      label: 'العملاء',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.bell, size: 22),
      selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
      label: 'الإشعارات',
    ),
  ];

  // ── Admin: الرئيسية | المشرفين | المندوبين | العملاء | الإشعارات
  static const _adminDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.shield, size: 22),
      selectedIcon: Icon(
        LucideIcons.shield,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المشرفين',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.briefcase, size: 22),
      selectedIcon: Icon(
        LucideIcons.briefcase,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المندوبين',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.users, size: 22),
      selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary),
      label: 'العملاء',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.bell, size: 22),
      selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
      label: 'الإشعارات',
    ),
  ];

  // ── General Manager: الرئيسية | المشرفين | المندوبين | العملاء | الفواتير | المدفوعات
  static const _generalManagerDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.shield, size: 22),
      selectedIcon: Icon(
        LucideIcons.shield,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المشرفين',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.briefcase, size: 22),
      selectedIcon: Icon(
        LucideIcons.briefcase,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المندوبين',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.users, size: 22),
      selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary),
      label: 'العملاء',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.fileText, size: 22),
      selectedIcon: Icon(
        LucideIcons.fileText,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'الفواتير',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.creditCard, size: 22),
      selectedIcon: Icon(
        LucideIcons.creditCard,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'المدفوعات',
    ),
  ];

  // ── Sales Manager: الرئيسية | الفواتير
  static const _salesManagerDestinations = [
    NavigationDestination(
      icon: Icon(LucideIcons.home, size: 22),
      selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
      label: 'الرئيسية',
    ),
    NavigationDestination(
      icon: Icon(LucideIcons.fileText, size: 22),
      selectedIcon: Icon(
        LucideIcons.fileText,
        size: 22,
        color: AppColors.primary,
      ),
      label: 'الفواتير',
    ),
  ];
}
