import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../screens/login_screen.dart';
import '../screens/home_screen.dart';
import '../screens/invoices_screen.dart';
import '../screens/invoice_detail_screen.dart';
import '../screens/payments_screen.dart';
import '../screens/returns_screen.dart';
import '../screens/account_statement_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/customers_screen.dart';
import '../screens/customer_detail_screen.dart';
import '../screens/sales_reps_screen.dart';
import '../screens/sales_rep_detail_screen.dart';
import '../screens/supervisors_screen.dart';
import '../screens/supervisor_detail_screen.dart';
import '../screens/shell_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createRouter(AuthProvider authProvider) {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/home',
    refreshListenable: authProvider,
    redirect: (context, state) {
      final isLoggedIn = authProvider.isLoggedIn;
      final isLoginRoute = state.matchedLocation == '/login';

      if (!isLoggedIn && !isLoginRoute) return '/login';
      if (isLoggedIn && isLoginRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => ShellScreen(child: child),
        routes: [
          GoRoute(
            path: '/home',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomeScreen(),
            ),
          ),
          GoRoute(
            path: '/invoices',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: InvoicesScreen(),
            ),
            routes: [
              GoRoute(
                path: ':id',
                parentNavigatorKey: rootNavigatorKey,
                builder: (context, state) => InvoiceDetailScreen(
                  invoiceId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/payments',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: PaymentsScreen(),
            ),
          ),
          GoRoute(
            path: '/returns',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ReturnsScreen(),
            ),
          ),
          GoRoute(
            path: '/statement',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: AccountStatementScreen(),
            ),
          ),
          GoRoute(
            path: '/notifications',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: NotificationsScreen(),
            ),
          ),
          // Customers list (for sales_rep / supervisor / admin)
          GoRoute(
            path: '/customers',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: CustomersScreen(),
            ),
            routes: [
              // Customer detail — full screen (no bottom nav)
              GoRoute(
                path: ':id',
                parentNavigatorKey: rootNavigatorKey,
                builder: (context, state) => CustomerDetailScreen(
                  customerId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          // Sales reps list (for supervisor / admin)
          GoRoute(
            path: '/sales-reps',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SalesRepsScreen(),
            ),
            routes: [
              // Sales rep detail — full screen drill-down
              GoRoute(
                path: ':id',
                parentNavigatorKey: rootNavigatorKey,
                builder: (context, state) => SalesRepDetailScreen(
                  salesRepId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          // Supervisors list (for admin)
          GoRoute(
            path: '/supervisors',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SupervisorsScreen(),
            ),
            routes: [
              // Supervisor detail — full screen drill-down
              GoRoute(
                path: ':id',
                parentNavigatorKey: rootNavigatorKey,
                builder: (context, state) => SupervisorDetailScreen(
                  supervisorId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
