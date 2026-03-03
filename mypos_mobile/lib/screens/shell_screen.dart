import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';

/// Determines which navigation variant to show based on user role.
enum _NavVariant { customer, salesRep, supervisor, admin }

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  _NavVariant _variant(String? role) {
    switch (role) {
      case 'admin':
        return _NavVariant.admin;
      case 'supervisor':
        return _NavVariant.supervisor;
      case 'sales_rep':
      case 'salesRep':
      case 'salesman':
        return _NavVariant.salesRep;
      default:
        return _NavVariant.customer;
    }
  }

  // ---------- Routes per role ----------
  static const _customerRoutes   = ['/home', '/invoices', '/payments', '/statement', '/notifications'];
  static const _salesRepRoutes   = ['/home', '/customers', '/notifications'];
  static const _supervisorRoutes = ['/home', '/sales-reps', '/customers', '/notifications'];
  static const _adminRoutes      = ['/home', '/supervisors', '/sales-reps', '/customers', '/notifications'];

  List<String> _routes(_NavVariant v) {
    switch (v) {
      case _NavVariant.admin:      return _adminRoutes;
      case _NavVariant.supervisor: return _supervisorRoutes;
      case _NavVariant.salesRep:   return _salesRepRoutes;
      case _NavVariant.customer:   return _customerRoutes;
    }
  }

  int _currentIndex(BuildContext context, _NavVariant v) {
    final location = GoRouterState.of(context).matchedLocation;
    final r = _routes(v);
    for (int i = 0; i < r.length; i++) {
      if (location.startsWith(r[i])) return i;
    }
    return 0;
  }

  void _onTap(BuildContext context, int index, _NavVariant v) {
    final r = _routes(v);
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
              selectedIndex: _currentIndex(context, v),
              onDestinationSelected: (index) => _onTap(context, index, v),
              backgroundColor: Colors.transparent,
              elevation: 0,
              indicatorColor: AppColors.primary.withOpacity(0.12),
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: 64,
              destinations: _destinations(v),
            ),
          ),
        ),
      ),
    );
  }

  List<NavigationDestination> _destinations(_NavVariant v) {
    switch (v) {
      case _NavVariant.customer:    return _customerDestinations;
      case _NavVariant.salesRep:    return _salesRepDestinations;
      case _NavVariant.supervisor:  return _supervisorDestinations;
      case _NavVariant.admin:       return _adminDestinations;
    }
  }

  // ── Customer: الرئيسية | الفواتير | المدفوعات | كشف حساب | الإشعارات
  static const _customerDestinations = [
    NavigationDestination(icon: Icon(LucideIcons.home, size: 22), selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary), label: 'الرئيسية'),
    NavigationDestination(icon: Icon(LucideIcons.fileText, size: 22), selectedIcon: Icon(LucideIcons.fileText, size: 22, color: AppColors.primary), label: 'الفواتير'),
    NavigationDestination(icon: Icon(LucideIcons.creditCard, size: 22), selectedIcon: Icon(LucideIcons.creditCard, size: 22, color: AppColors.primary), label: 'المدفوعات'),
    NavigationDestination(icon: Icon(LucideIcons.scrollText, size: 22), selectedIcon: Icon(LucideIcons.scrollText, size: 22, color: AppColors.primary), label: 'كشف حساب'),
    NavigationDestination(icon: Icon(LucideIcons.bell, size: 22), selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary), label: 'الإشعارات'),
  ];

  // ── Sales Rep: الرئيسية | العملاء | الإشعارات
  static const _salesRepDestinations = [
    NavigationDestination(icon: Icon(LucideIcons.home, size: 22), selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary), label: 'الرئيسية'),
    NavigationDestination(icon: Icon(LucideIcons.users, size: 22), selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary), label: 'العملاء'),
    NavigationDestination(icon: Icon(LucideIcons.bell, size: 22), selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary), label: 'الإشعارات'),
  ];

  // ── Supervisor: الرئيسية | المندوبين | العملاء | الإشعارات
  static const _supervisorDestinations = [
    NavigationDestination(icon: Icon(LucideIcons.home, size: 22), selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary), label: 'الرئيسية'),
    NavigationDestination(icon: Icon(LucideIcons.briefcase, size: 22), selectedIcon: Icon(LucideIcons.briefcase, size: 22, color: AppColors.primary), label: 'المندوبين'),
    NavigationDestination(icon: Icon(LucideIcons.users, size: 22), selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary), label: 'العملاء'),
    NavigationDestination(icon: Icon(LucideIcons.bell, size: 22), selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary), label: 'الإشعارات'),
  ];

  // ── Admin: الرئيسية | المشرفين | المندوبين | العملاء | الإشعارات
  static const _adminDestinations = [
    NavigationDestination(icon: Icon(LucideIcons.home, size: 22), selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary), label: 'الرئيسية'),
    NavigationDestination(icon: Icon(LucideIcons.shield, size: 22), selectedIcon: Icon(LucideIcons.shield, size: 22, color: AppColors.primary), label: 'المشرفين'),
    NavigationDestination(icon: Icon(LucideIcons.briefcase, size: 22), selectedIcon: Icon(LucideIcons.briefcase, size: 22, color: AppColors.primary), label: 'المندوبين'),
    NavigationDestination(icon: Icon(LucideIcons.users, size: 22), selectedIcon: Icon(LucideIcons.users, size: 22, color: AppColors.primary), label: 'العملاء'),
    NavigationDestination(icon: Icon(LucideIcons.bell, size: 22), selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary), label: 'الإشعارات'),
  ];
}
