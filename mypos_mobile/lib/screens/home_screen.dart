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
import '../widgets/profile_switcher_widget.dart';
import '../services/api_service.dart';
import '../config/api_config.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late DateTime _fromDate;
  late DateTime _toDate;
  String? _priceListUrl;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _fromDate = DateTime(now.year, now.month, 1);
    _toDate = now;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
      _loadPriceList();
    });
  }

  Future<void> _loadPriceList() async {
    try {
      final api = ApiService();
      final res = await api.get(ApiConfig.priceList);
      if (res.data['exists'] == true && res.data['url'] != null) {
        if (mounted) setState(() => _priceListUrl = res.data['url']);
      }
    } catch (_) {}
  }

  Future<void> _openPriceList() async {
    if (_priceListUrl == null) return;
    context.push('/price-list');
  }

  Future<void> _loadData() async {
    final authProvider = context.read<AuthProvider>();
    final dataProvider = context.read<DataProvider>();
    final user = authProvider.user;

    if (user != null) {
      if (user.isCustomer) {
        // Customer: load all data
        final range = DateRange(from: _fromDate, to: _toDate);
        await dataProvider.loadAllData(
          fromDate: range.fromParam,
          toDate: range.toParam,
        );
        return;
      }

      // Staff: load only what they have permission for
      final hasInvoices = user.hasPermission('mobile_app.invoices') || user.hasPermission('invoices.view');
      final hasPayments = user.hasPermission('mobile_app.payments') || user.hasPermission('payments.view');
      final hasCustomers = user.hasPermission('mobile_app.customers') || user.hasPermission('customers.view');
      final hasDue = user.hasPermission('mobile_app.due');
      final hasHome = user.hasPermission('mobile_app.home');

      // Only load dashboard if they have home or due or invoices or payments permission
      if (hasHome || hasDue || hasInvoices || hasPayments) {
        final range = DateRange(from: _fromDate, to: _toDate);
        await dataProvider.loadDashboard(fromDate: range.fromParam, toDate: range.toParam);

        final futures = <Future>[];
        if (hasInvoices) {
          futures.add(dataProvider.loadInvoices(refresh: true, fromDate: range.fromParam, toDate: range.toParam));
          futures.add(dataProvider.loadReturns(refresh: true, fromDate: range.fromParam, toDate: range.toParam));
        }
        if (hasPayments) {
          futures.add(dataProvider.loadPayments(refresh: true, fromDate: range.fromParam, toDate: range.toParam));
        }
        if (futures.isNotEmpty) await Future.wait(futures);
      }

      // Load customers if they have permission
      if (hasCustomers || hasHome) {
        await dataProvider.loadCustomers();
      }
      // Load sales reps if they have permission
      if (user.hasPermission('mobile_app.sales_reps') ||
          user.hasPermission('mobile_app.supervisors')) {
        await dataProvider.loadSalesReps();
      }
      // Load supervisors if they have permission
      if (user.hasPermission('mobile_app.supervisors')) {
        await dataProvider.loadSupervisors();
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
          if (context.watch<AuthProvider>().linkedProfiles.length > 1)
            IconButton(
              icon: const Icon(Icons.switch_account_outlined, color: AppColors.card),
              onPressed: () => ProfileSwitcherWidget.show(context),
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
                    ? _buildStaffHomeContent(dataProvider, formatter, user)
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
      if (_priceListUrl != null) ...[
        _QuickActionTile(
          icon: LucideIcons.fileSpreadsheet,
          label: 'لستة الاسعار',
          subtitle: 'عرض لستة الأسعار',
          color: AppColors.primary,
          onTap: _openPriceList,
        ),
        const SizedBox(height: 8),
      ],
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

  // ===================== STAFF HOME (permission-based) =====================
  List<Widget> _buildStaffHomeContent(
    DataProvider dataProvider,
    NumberFormat formatter,
    User user,
  ) {
    final customerCount = dataProvider.customers.length;
    final hasSupervisors = user.hasPermission('mobile_app.supervisors');
    final hasSalesReps = user.hasPermission('mobile_app.sales_reps');
    final hasCustomers = user.hasPermission('mobile_app.customers') || user.hasPermission('customers.view');
    final hasInvoices = user.hasPermission('mobile_app.invoices') || user.hasPermission('invoices.view');
    final hasPayments = user.hasPermission('mobile_app.payments') || user.hasPermission('payments.view');
    final hasDue = user.hasPermission('mobile_app.due');

    final canCreateInvoice = user.hasPermission('mobile_app.create_invoice') || user.hasPermission('invoices.create');

    final canCreatePayment = user.hasPermission('mobile_app.create_payment') || user.hasPermission('collections.create');

    return [
      // أزرار الإجراءات السريعة
      if (canCreateInvoice || canCreatePayment) ...[                          
        Row(
          children: [
            if (canCreateInvoice)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () async {
                    await context.push('/invoices/create');
                    dataProvider.loadInvoices(refresh: true);
                  },
                  icon: const Icon(LucideIcons.plus, size: 18),
                  label: const Text('فاتورة جديدة'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            if (canCreateInvoice && canCreatePayment) const SizedBox(width: 12),
            if (canCreatePayment)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () async {
                    await context.push('/payments/create');
                    dataProvider.loadPayments(refresh: true);
                  },
                  icon: const Icon(LucideIcons.wallet, size: 18),
                  label: const Text('إضافة قبض'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
      ],
      // ── Summary cards based on permissions ──
      if (hasSupervisors || hasSalesReps || hasCustomers) ...[
        _buildSummaryRow(
          items: [
            if (hasSupervisors)
              _SummaryItem(
                icon: LucideIcons.shield,
                gradient: const [Color(0xFF6C5CE7), Color(0xFF8B7CF6)],
                count: dataProvider.supervisors.length,
                label: 'مشرف',
                onTap: () => context.go('/supervisors'),
              ),
            if (hasSalesReps)
              _SummaryItem(
                icon: LucideIcons.briefcase,
                gradient: const [AppColors.secondary, Color(0xFF4A8FE7)],
                count: dataProvider.salesReps.length,
                label: 'مندوب',
                onTap: () => context.go('/sales-reps'),
              ),
            if (hasCustomers)
              _SummaryItem(
                icon: LucideIcons.users,
                gradient: const [AppColors.primary, AppColors.primaryLight],
                count: customerCount,
                label: 'عميل',
                onTap: () => context.go('/customers'),
              ),
          ],
        ),
      ],
      const SizedBox(height: 12),

      // Total customers debt card
      if (hasDue || hasInvoices || hasPayments) ...[
        _TotalDebtCard(
          totalBalance: dataProvider.totalCustomersBalance,
          formatter: formatter,
        ),
        const SizedBox(height: 12),
      ],

      // Date filter
      if (hasInvoices || hasPayments) ...[
        Center(
          child: DateFilterWidget(
            fromDate: _fromDate,
            toDate: _toDate,
            onChanged: _onDateChanged,
          ),
        ),
        const SizedBox(height: 16),
      ],

      // Aggregate stats
      if (hasInvoices) ...[
        Row(
          children: [
            Expanded(
              child: _StatCard(
                icon: LucideIcons.fileText,
                iconColor: AppColors.secondary,
                label: 'إجمالي الفواتير',
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
      ],
      if (hasPayments) ...[
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
            if (hasInvoices)
              Expanded(
                child: _StatCard(
                  icon: LucideIcons.rotateCcw,
                  iconColor: AppColors.warning,
                  label: 'المرتجعات',
                  value: '${dataProvider.totalReturns}',
                  onTap: () => context.go('/payments'),
                ),
              ),
          ],
        ),
      ],
      const SizedBox(height: 24),

      // Quick Actions for staff
      Text(
        'الوصول السريع',
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 12),

      if (_priceListUrl != null) ...[
        _QuickActionTile(
          icon: LucideIcons.fileSpreadsheet,
          label: 'لستة الاسعار',
          subtitle: 'عرض لستة الأسعار',
          color: AppColors.primary,
          onTap: _openPriceList,
        ),
        const SizedBox(height: 8),
      ],

      if (hasSupervisors) ...[
        _QuickActionTile(
          icon: LucideIcons.shield,
          label: 'المشرفين',
          subtitle: 'عرض قائمة المشرفين والمندوبين التابعين لهم',
          color: const Color(0xFF6C5CE7),
          onTap: () => context.go('/supervisors'),
        ),
        const SizedBox(height: 8),
      ],

      if (hasSalesReps) ...[
        _QuickActionTile(
          icon: LucideIcons.briefcase,
          label: 'المندوبين',
          subtitle: 'عرض قائمة مندوبي المبيعات وعملائهم',
          color: AppColors.secondary,
          onTap: () => context.go('/sales-reps'),
        ),
        const SizedBox(height: 8),
      ],

      if (hasCustomers) ...[
        _QuickActionTile(
          icon: LucideIcons.users,
          label: 'العملاء',
          subtitle: 'عرض قائمة العملاء وبياناتهم',
          color: AppColors.primary,
          onTap: () => context.go('/customers'),
        ),
        const SizedBox(height: 8),
      ],

      _QuickActionTile(
        icon: LucideIcons.bell,
        label: 'الإشعارات',
        subtitle: 'عرض الإشعارات والتنبيهات',
        color: AppColors.secondary,
        onTap: () => context.go('/notifications'),
      ),
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
