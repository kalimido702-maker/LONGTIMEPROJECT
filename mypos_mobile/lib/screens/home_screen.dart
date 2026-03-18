import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../models/user.dart';
import '../widgets/date_filter_widget.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late DateTime _fromDate;
  late DateTime _toDate;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _fromDate = DateTime(now.year, now.month, 1);
    _toDate = now;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  Future<void> _loadData() async {
    final authProvider = context.read<AuthProvider>();
    final dataProvider = context.read<DataProvider>();
    final user = authProvider.user;

    if (user != null) {
      // Sales manager: no dashboard data needed (empty home)
      if (user.isSalesManager) return;

      final range = DateRange(from: _fromDate, to: _toDate);
      await dataProvider.loadAllData(
        fromDate: range.fromParam,
        toDate: range.toParam,
      );
      // For staff, also load customers if they have permission
      if (!user.isCustomer &&
          (user.hasPermission('customers.view') ||
              user.hasPermission('mobile_app.statement') ||
              user.hasPermission('mobile_app.home'))) {
        await dataProvider.loadCustomers();
      }
      // Supervisor: also load their sales reps
      if (user.isSupervisor) {
        await dataProvider.loadSalesReps();
      }
      // Admin or General Manager: load supervisors + sales reps
      if (user.isAdmin || user.isGeneralManager) {
        await dataProvider.loadSupervisors();
        await dataProvider.loadSalesReps();
      }
    }
  }

  void _onDateChanged(DateRange range) {
    setState(() {
      _fromDate = range.from;
      _toDate = range.to;
    });
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final dataProvider = context.watch<DataProvider>();
    final user = authProvider.user;
    final formatter = NumberFormat('#,##0.00', 'ar');
    final isStaff = user != null && !user.isCustomer;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${user?.fullName ?? ''}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            Text(
              _getRoleLabel(user?.role),
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withOpacity(0.8),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 20),
            onPressed: _loadData,
          ),
          PopupMenuButton<String>(
            icon: const Icon(LucideIcons.moreVertical, size: 20),
            onSelected: (value) {
              if (value == 'profile') {
                context.push('/profile');
              } else if (value == 'logout') {
                authProvider.logout();
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'profile',
                child: Row(
                  children: [
                    Icon(
                      LucideIcons.user,
                      size: 18,
                      color: AppColors.textPrimary,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'الملف الشخصي',
                      style: TextStyle(color: AppColors.textPrimary),
                    ),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(LucideIcons.logOut, size: 18, color: AppColors.error),
                    SizedBox(width: 8),
                    Text(
                      'تسجيل الخروج',
                      style: TextStyle(color: AppColors.error),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        color: AppColors.primary,
        child: dataProvider.isLoading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: isStaff
                    ? (user.isSalesManager
                        ? _buildSalesManagerHomeContent()
                        : _buildStaffHomeContent(dataProvider, formatter, user))
                    : _buildCustomerHomeContent(dataProvider, formatter),
              ),
      ),
    );
  }

  // ===================== CUSTOMER HOME =====================
  List<Widget> _buildCustomerHomeContent(
    DataProvider dataProvider,
    NumberFormat formatter,
  ) {
    return [
      // Balance Card
      _BalanceCard(
        remaining: dataProvider.customerInfo != null
            ? double.tryParse(
                    dataProvider.customerInfo!['current_balance']?.toString() ??
                        '0',
                  ) ??
                  0
            : dataProvider.totalRemaining,
        formatter: formatter,
      ),
      const SizedBox(height: 12),

      // Date filter
      Center(
        child: DateFilterWidget(
          fromDate: _fromDate,
          toDate: _toDate,
          onChanged: _onDateChanged,
        ),
      ),
      const SizedBox(height: 16),

      // Stats Grid
      Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: LucideIcons.fileText,
              iconColor: AppColors.secondary,
              label: 'الفواتير',
              value: '${dataProvider.totalInvoices}',
              onTap: () => context.go('/invoices'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              icon: LucideIcons.trendingUp,
              iconColor: AppColors.primary,
              label: 'إجمالي المبيعات',
              value: formatter.format(dataProvider.totalDebt),
              onTap: () => context.go('/invoices'),
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: LucideIcons.creditCard,
              iconColor: AppColors.success,
              label: 'المدفوعات',
              value: formatter.format(dataProvider.totalPaymentAmount),
              onTap: () => context.go('/payments'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              icon: LucideIcons.rotateCcw,
              iconColor: AppColors.warning,
              label: 'المرتجعات',
              value: '${dataProvider.totalReturns}',
              onTap: () => context.go('/returns'),
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),

      // Quick Actions
      Text(
        'الوصول السريع',
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 12),
      _QuickActionTile(
        icon: LucideIcons.fileText,
        label: 'الفواتير المسلمة',
        subtitle: 'عرض جميع الفواتير التي تم تسليمها',
        color: AppColors.secondary,
        onTap: () => context.go('/invoices'),
      ),
      const SizedBox(height: 8),
      _QuickActionTile(
        icon: LucideIcons.scrollText,
        label: 'كشف الحساب',
        subtitle: 'عرض كشف حساب مفصل',
        color: AppColors.primary,
        onTap: () => context.go('/statement'),
      ),
      const SizedBox(height: 8),
      _QuickActionTile(
        icon: LucideIcons.creditCard,
        label: 'سندات القبض',
        subtitle: 'عرض جميع المدفوعات',
        color: AppColors.success,
        onTap: () => context.go('/payments'),
      ),
      const SizedBox(height: 8),
      _QuickActionTile(
        icon: LucideIcons.rotateCcw,
        label: 'المرتجعات',
        subtitle: 'عرض فواتير المرتجعات',
        color: AppColors.warning,
        onTap: () => context.go('/returns'),
      ),
    ];
  }

  // ===================== SALES MANAGER HOME (empty) =====================
  List<Widget> _buildSalesManagerHomeContent() {
    return [
      const SizedBox(height: 40),
      Center(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                LucideIcons.briefcase,
                size: 48,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'مرحباً',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'يمكنك عرض الفواتير من التبويب أدناه',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    ];
  }

  // ===================== STAFF HOME (sales_rep / supervisor / admin / general_manager) =====================
  List<Widget> _buildStaffHomeContent(
    DataProvider dataProvider,
    NumberFormat formatter,
    User user,
  ) {
    final customerCount = dataProvider.customers.length;
    final isAdmin = user.isAdmin;
    final isGeneralManager = user.isGeneralManager;
    final isSupervisor = user.isSupervisor;

    return [
      // ── Admin or General Manager: supervisors + reps + customers summary ──
      if (isAdmin || isGeneralManager) ...[
        _buildSummaryRow(
          items: [
            _SummaryItem(
              icon: LucideIcons.shield,
              gradient: const [Color(0xFF6C5CE7), Color(0xFF8B7CF6)],
              count: dataProvider.supervisors.length,
              label: 'مشرف',
              onTap: () => context.go('/supervisors'),
            ),
            _SummaryItem(
              icon: LucideIcons.briefcase,
              gradient: const [AppColors.secondary, Color(0xFF4A8FE7)],
              count: dataProvider.salesReps.length,
              label: 'مندوب',
              onTap: () => context.go('/sales-reps'),
            ),
            _SummaryItem(
              icon: LucideIcons.users,
              gradient: const [AppColors.primary, AppColors.primaryLight],
              count: customerCount,
              label: 'عميل',
              onTap: () => context.go('/customers'),
            ),
          ],
        ),
      ]
      // ── Supervisor: reps + customers summary ──
      else if (isSupervisor) ...[
        _buildSummaryRow(
          items: [
            _SummaryItem(
              icon: LucideIcons.briefcase,
              gradient: const [AppColors.secondary, Color(0xFF4A8FE7)],
              count: dataProvider.salesReps.length,
              label: 'مندوب',
              onTap: () => context.go('/sales-reps'),
            ),
            _SummaryItem(
              icon: LucideIcons.users,
              gradient: const [AppColors.primary, AppColors.primaryLight],
              count: customerCount,
              label: 'عميل',
              onTap: () => context.go('/customers'),
            ),
          ],
        ),
      ]
      // ── Sales Rep: customers only ──
      else ...[
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.primary, AppColors.primaryLight],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      LucideIcons.users,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'عدد العملاء',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.9),
                      fontSize: 15,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                '$customerCount عميل',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 12),

      // Total customers debt card
      _TotalDebtCard(
        totalBalance: dataProvider.totalCustomersBalance,
        formatter: formatter,
      ),
      const SizedBox(height: 12),

      // Date filter
      Center(
        child: DateFilterWidget(
          fromDate: _fromDate,
          toDate: _toDate,
          onChanged: _onDateChanged,
        ),
      ),
      const SizedBox(height: 16),

      // Aggregate stats
      Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: LucideIcons.fileText,
              iconColor: AppColors.secondary,
              label: 'إجمالي الفواتير',
              value: '${dataProvider.totalInvoices}',
              onTap: () => context.go('/customers'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              icon: LucideIcons.trendingUp,
              iconColor: AppColors.primary,
              label: 'إجمالي المبيعات',
              value: formatter.format(dataProvider.totalDebt),
              onTap: () => context.go('/customers'),
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: LucideIcons.creditCard,
              iconColor: AppColors.success,
              label: 'المدفوعات',
              value: formatter.format(dataProvider.totalPaymentAmount),
              onTap: () => context.go('/customers'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              icon: LucideIcons.rotateCcw,
              iconColor: AppColors.warning,
              label: 'المرتجعات',
              value: '${dataProvider.totalReturns}',
              onTap: () => context.go('/customers'),
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),

      // Quick Actions for staff
      Text(
        'الوصول السريع',
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 12),

      // Admin or General Manager quick actions for supervisors
      if (isAdmin || isGeneralManager) ...[
        _QuickActionTile(
          icon: LucideIcons.shield,
          label: 'المشرفين',
          subtitle: 'عرض قائمة المشرفين والمندوبين التابعين لهم',
          color: const Color(0xFF6C5CE7),
          onTap: () => context.go('/supervisors'),
        ),
        const SizedBox(height: 8),
      ],

      // Admin, General Manager, or Supervisor quick action for reps
      if (isAdmin || isGeneralManager || isSupervisor) ...[
        _QuickActionTile(
          icon: LucideIcons.briefcase,
          label: 'المندوبين',
          subtitle: 'عرض قائمة مندوبي المبيعات وعملائهم',
          color: AppColors.secondary,
          onTap: () => context.go('/sales-reps'),
        ),
        const SizedBox(height: 8),
      ],

      _QuickActionTile(
        icon: LucideIcons.users,
        label: 'العملاء',
        subtitle: 'عرض قائمة العملاء وبياناتهم',
        color: AppColors.primary,
        onTap: () => context.go('/customers'),
      ),
      // General Manager: no notifications
      if (!isGeneralManager) ...[
        const SizedBox(height: 8),
        _QuickActionTile(
          icon: LucideIcons.bell,
          label: 'الإشعارات',
          subtitle: 'عرض الإشعارات والتنبيهات',
          color: AppColors.secondary,
          onTap: () => context.go('/notifications'),
        ),
      ],
    ];
  }

  /// Build a row of compact summary cards.
  Widget _buildSummaryRow({required List<_SummaryItem> items}) {
    return Row(
      children: items.asMap().entries.map((entry) {
        final idx = entry.key;
        final item = entry.value;
        return Expanded(
          child: GestureDetector(
            onTap: item.onTap,
            child: Container(
              margin: EdgeInsets.only(left: idx < items.length - 1 ? 10 : 0),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: item.gradient,
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: item.gradient.first.withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Icon(item.icon, color: Colors.white, size: 22),
                  const SizedBox(height: 10),
                  Text(
                    '${item.count}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.label,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  String _getRoleLabel(String? role) {
    switch (role) {
      case 'admin':
        return 'مدير النظام';
      case 'supervisor':
        return 'مشرف';
      case 'sales_rep':
      case 'salesman':
        return 'مندوب مبيعات';
      case 'customer':
        return 'عميل';
      case 'cashier':
        return 'كاشير';
      case 'general_manager':
        return 'مدير عام';
      case 'sales_manager':
        return 'مسؤول مبيعات';
      default:
        return role ?? '';
    }
  }
}

/// Helper for the summary row in staff home.
class _SummaryItem {
  final IconData icon;
  final List<Color> gradient;
  final int count;
  final String label;
  final VoidCallback? onTap;
  const _SummaryItem({
    required this.icon,
    required this.gradient,
    required this.count,
    required this.label,
    this.onTap,
  });
}

class _BalanceCard extends StatelessWidget {
  final double remaining;
  final NumberFormat formatter;

  const _BalanceCard({required this.remaining, required this.formatter});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  LucideIcons.wallet,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'الرصيد المستحق',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.9),
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            '${formatter.format(remaining)} جنيه',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final VoidCallback? onTap;

  const _StatCard({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 22, color: color),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                LucideIcons.chevronLeft,
                size: 20,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TotalDebtCard extends StatelessWidget {
  final double totalBalance;
  final NumberFormat formatter;

  const _TotalDebtCard({required this.totalBalance, required this.formatter});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE74C3C), Color(0xFFC0392B)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFE74C3C).withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  LucideIcons.alertTriangle,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'إجمالي المديونيات',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.9),
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            '${formatter.format(totalBalance)} جنيه',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
