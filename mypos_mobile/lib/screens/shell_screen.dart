import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../config/theme.dart';

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/home')) return 0;
    if (location.startsWith('/invoices')) return 1;
    if (location.startsWith('/payments')) return 2;
    if (location.startsWith('/statement')) return 3;
    if (location.startsWith('/notifications')) return 4;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/home');
        break;
      case 1:
        context.go('/invoices');
        break;
      case 2:
        context.go('/payments');
        break;
      case 3:
        context.go('/statement');
        break;
      case 4:
        context.go('/notifications');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
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
              selectedIndex: _currentIndex(context),
              onDestinationSelected: (index) => _onTap(context, index),
              backgroundColor: Colors.transparent,
              elevation: 0,
              indicatorColor: AppColors.primary.withOpacity(0.12),
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: 64,
              destinations: const [
                NavigationDestination(
                  icon: Icon(LucideIcons.home, size: 22),
                  selectedIcon: Icon(LucideIcons.home, size: 22, color: AppColors.primary),
                  label: 'الرئيسية',
                ),
                NavigationDestination(
                  icon: Icon(LucideIcons.fileText, size: 22),
                  selectedIcon: Icon(LucideIcons.fileText, size: 22, color: AppColors.primary),
                  label: 'الفواتير',
                ),
                NavigationDestination(
                  icon: Icon(LucideIcons.creditCard, size: 22),
                  selectedIcon: Icon(LucideIcons.creditCard, size: 22, color: AppColors.primary),
                  label: 'المدفوعات',
                ),
                NavigationDestination(
                  icon: Icon(LucideIcons.scrollText, size: 22),
                  selectedIcon: Icon(LucideIcons.scrollText, size: 22, color: AppColors.primary),
                  label: 'كشف حساب',
                ),
                NavigationDestination(
                  icon: Icon(LucideIcons.bell, size: 22),
                  selectedIcon: Icon(LucideIcons.bell, size: 22, color: AppColors.primary),
                  label: 'الإشعارات',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
