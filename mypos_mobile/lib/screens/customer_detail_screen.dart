import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../models/customer.dart';
import '../models/invoice.dart';
import '../models/payment.dart';
import '../models/sales_return.dart';
import '../models/account_entry.dart';
import '../services/api_service.dart';
import '../services/invoice_pdf_service.dart';
import '../widgets/date_filter_widget.dart';

/// Full-screen detail view for a specific customer.
/// Shows customer info + 4 tabs: invoices, payments, returns, statement.
class CustomerDetailScreen extends StatefulWidget {
  final String customerId;
  const CustomerDetailScreen({super.key, required this.customerId});

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen>
    with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;

  // Date range
  late DateTime _fromDate;
  late DateTime _toDate;

  // Customer info
  Customer? _customer;

  // Tab data
  List<Invoice> _invoices = [];
  List<Payment> _payments = [];
  List<SalesReturn> _returns = [];
  List<AccountEntry> _entries = [];

  // Loading states per tab
  bool _loadingInvoices = false;
  bool _loadingPayments = false;
  bool _loadingReturns = false;
  bool _loadingStatement = false;
  bool _loadingCustomer = true;
  String? _sharingInvoiceId;

  // Totals
  double _totalInvoices = 0;
  double _totalPayments = 0;
  double _totalReturns = 0;
  double _statementBalance = 0;
  double?
  _trueBalance; // Dynamic balance from account statement (always accurate)

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    final now = DateTime.now();
    _fromDate = DateTime(now.year, 1, 1);
    _toDate = DateTime(now.year, 12, 31);

    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        _loadTabData(_tabController.index);
      }
    });

    _loadCustomerInfo();
    _loadTabData(0); // Start with invoices
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String get _fromParam => DateFormat('yyyy-MM-dd').format(_fromDate);
  String get _toParam => DateFormat('yyyy-MM-dd').format(_toDate);

  Future<void> _loadCustomerInfo() async {
    try {
      final res = await _api.getCustomers(customerId: widget.customerId);
      final data = res['data'] as List? ?? [];
      if (data.isNotEmpty) {
        final c = Customer.fromJson(data[0] as Map<String, dynamic>);
        if (mounted) setState(() => _customer = c);
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingCustomer = false);

    // Also load true balance from full account statement (no date filter)
    try {
      final stRes = await _api.getAccountStatement(
        customerId: widget.customerId,
      );
      final stData = stRes['data'] as Map<String, dynamic>? ?? {};
      final stTotals = stData['totals'] as Map<String, dynamic>? ?? {};
      if (mounted)
        setState(() => _trueBalance = _toDouble(stTotals['balance']));
    } catch (_) {}
  }

  Future<void> _shareInvoicePdf(String invoiceId) async {
    setState(() => _sharingInvoiceId = invoiceId);
    try {
      // Fetch full invoice with items
      final res = await _api.getInvoice(invoiceId);
      final data = res['data'] as Map<String, dynamic>? ?? {};
      final invoice = Invoice.fromJson(data);
      await InvoicePdfService.shareInvoice(invoice);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('حدث خطأ: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
    if (mounted) setState(() => _sharingInvoiceId = null);
  }

  void _onDateChanged(DateRange range) {
    setState(() {
      _fromDate = range.from;
      _toDate = range.to;
    });
    _loadTabData(_tabController.index);
  }

  Future<void> _loadTabData(int tabIndex) async {
    switch (tabIndex) {
      case 0:
        _loadInvoices();
        break;
      case 1:
        _loadPayments();
        break;
      case 2:
        _loadReturns();
        break;
      case 3:
        _loadStatement();
        break;
    }
  }

  Future<void> _loadInvoices() async {
    if (_loadingInvoices) return;
    setState(() => _loadingInvoices = true);
    try {
      final res = await _api.getInvoices(
        customerId: widget.customerId,
        fromDate: _fromParam,
        toDate: _toParam,
        limit: 500,
      );
      final data = res['data'] as List? ?? [];
      _invoices = data
          .map((j) => Invoice.fromJson(j as Map<String, dynamic>))
          .toList();
      // Use server-side totals (covers ALL records, not just paginated)
      final totals = res['totals'] as Map<String, dynamic>?;
      _totalInvoices = _toDouble(
        totals?['total_amount'] ??
            _invoices.fold(0.0, (sum, i) => sum + i.total),
      );
    } catch (_) {}
    if (mounted) setState(() => _loadingInvoices = false);
  }

  Future<void> _loadPayments() async {
    if (_loadingPayments) return;
    setState(() => _loadingPayments = true);
    try {
      final res = await _api.getPayments(
        customerId: widget.customerId,
        fromDate: _fromParam,
        toDate: _toParam,
        limit: 500,
      );
      final data = res['data'] as List? ?? [];
      _payments = data
          .map((j) => Payment.fromJson(j as Map<String, dynamic>))
          .toList();
      // Use server-side totals
      final totals = res['totals'] as Map<String, dynamic>?;
      _totalPayments = _toDouble(
        totals?['total_amount'] ??
            _payments.fold(0.0, (sum, p) => sum + p.amount),
      );
    } catch (_) {}
    if (mounted) setState(() => _loadingPayments = false);
  }

  Future<void> _loadReturns() async {
    if (_loadingReturns) return;
    setState(() => _loadingReturns = true);
    try {
      final res = await _api.getReturns(
        customerId: widget.customerId,
        fromDate: _fromParam,
        toDate: _toParam,
        limit: 500,
      );
      final data = res['data'] as List? ?? [];
      _returns = data
          .map((j) => SalesReturn.fromJson(j as Map<String, dynamic>))
          .toList();
      // Use server-side totals
      final totals = res['totals'] as Map<String, dynamic>?;
      _totalReturns = _toDouble(
        totals?['total_amount'] ??
            _returns.fold(
              0.0,
              (sum, r) => sum + (r.total > 0 ? r.total : r.totalAmount),
            ),
      );
    } catch (_) {}
    if (mounted) setState(() => _loadingReturns = false);
  }

  Future<void> _loadStatement() async {
    if (_loadingStatement) return;
    setState(() => _loadingStatement = true);
    try {
      final res = await _api.getAccountStatement(
        customerId: widget.customerId,
        // Removed fromDate and toDate to show all statement entries
      );
      final data = res['data'] as Map<String, dynamic>? ?? {};
      final entries = data['entries'] as List? ?? [];
      _entries = entries
          .map((e) => AccountEntry.fromJson(e as Map<String, dynamic>))
          .toList();
      final totals = data['totals'] as Map<String, dynamic>? ?? {};
      _statementBalance = _toDouble(totals['balance']);
    } catch (_) {}
    if (mounted) setState(() => _loadingStatement = false);
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final dateFormatter = DateFormat('yyyy/MM/dd', 'ar');

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'تفاصيل العميل' + " ${_customer?.name ?? ''}",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelStyle: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 13,
            fontFamily: 'Cairo',
          ),
          unselectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.normal,
            fontSize: 13,
            fontFamily: 'Cairo',
          ),
          tabs: const [
            Tab(text: 'الفواتير'),
            Tab(text: 'المدفوعات'),
            Tab(text: 'المرتجعات'),
            Tab(text: 'كشف الحساب'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Customer info card
          _buildCustomerHeader(formatter),

          // Date filter
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: [
                DateFilterWidget(
                  fromDate: _fromDate,
                  toDate: _toDate,
                  onChanged: _onDateChanged,
                ),
              ],
            ),
          ),

          // Tab content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildInvoicesTab(formatter, dateFormatter),
                _buildPaymentsTab(formatter, dateFormatter),
                _buildReturnsTab(formatter, dateFormatter),
                _buildStatementTab(formatter, dateFormatter),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomerHeader(NumberFormat formatter) {
    if (_loadingCustomer) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.primary,
          ),
        ),
      );
    }
    if (_customer == null) return const SizedBox.shrink();

    // Use dynamic balance (from account statement) if available, otherwise use stored balance
    final balance = _trueBalance ?? _customer!.currentBalance;
    final balanceColor = balance > 0 ? AppColors.error : AppColors.success;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(
                _customer!.name.isNotEmpty ? _customer!.name[0] : '?',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _customer!.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                if (_customer!.phone != null && _customer!.phone!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: [
                        const Icon(
                          LucideIcons.phone,
                          size: 13,
                          color: Colors.white60,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _customer!.phone!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${formatter.format(balance.abs())} جنيه',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 2),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  balance > 0
                      ? 'عليه'
                      : balance < 0
                      ? 'ليه'
                      : 'صفر',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ===================== INVOICES TAB =====================
  Widget _buildInvoicesTab(NumberFormat formatter, DateFormat dateFormatter) {
    if (_loadingInvoices) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_invoices.isEmpty) {
      return _buildEmptyTab(LucideIcons.fileText, 'لا توجد فواتير');
    }
    return Column(
      children: [
        _buildTabSummary(
          icon: LucideIcons.fileText,
          iconColor: AppColors.secondary,
          label: '${_invoices.length} فاتورة',
          totalLabel: 'إجمالي',
          total: formatter.format(_totalInvoices),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadInvoices,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _invoices.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final inv = _invoices[index];
                return _buildInvoiceCard(inv, formatter, dateFormatter);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInvoiceCard(
    Invoice inv,
    NumberFormat formatter,
    DateFormat dateFormatter,
  ) {
    // No payment status display
    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(inv.createdAt ?? '');
    } catch (_) {}
    final isSharing = _sharingInvoiceId == inv.id;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.push('/invoices/${inv.id}'),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      LucideIcons.receipt,
                      size: 18,
                      color: AppColors.secondary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'فاتورة ${inv.invoiceNumber ?? '#${inv.id.substring(0, 8)}'}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  Text(
                    '${formatter.format(inv.total)} جنيه',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(width: 6),
                  // Share button
                  SizedBox(
                    width: 32,
                    height: 32,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      iconSize: 18,
                      onPressed: isSharing
                          ? null
                          : () => _shareInvoicePdf(inv.id),
                      icon: isSharing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.primary,
                              ),
                            )
                          : Icon(
                              LucideIcons.share2,
                              size: 16,
                              color: Colors.grey[500],
                            ),
                      tooltip: 'مشاركة PDF',
                    ),
                  ),
                ],
              ),
              if (parsedDate != null || inv.remainingAmount > 0) ...[
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (parsedDate != null)
                      Row(
                        children: [
                          Icon(
                            LucideIcons.calendar,
                            size: 12,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            dateFormatter.format(parsedDate),
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey[500],
                            ),
                          ),
                        ],
                      ),
                    if (inv.remainingAmount > 0)
                      Text(
                        'المتبقي: ${formatter.format(inv.remainingAmount)} جنيه',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.error,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // ===================== PAYMENTS TAB =====================
  Widget _buildPaymentsTab(NumberFormat formatter, DateFormat dateFormatter) {
    if (_loadingPayments) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_payments.isEmpty) {
      return _buildEmptyTab(LucideIcons.creditCard, 'لا توجد مدفوعات');
    }
    return Column(
      children: [
        _buildTabSummary(
          icon: LucideIcons.creditCard,
          iconColor: AppColors.success,
          label: '${_payments.length} سند قبض',
          totalLabel: 'إجمالي',
          total: formatter.format(_totalPayments),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadPayments,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _payments.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final p = _payments[index];
                DateTime? parsedDate;
                try {
                  parsedDate = DateTime.parse(p.createdAt ?? '');
                } catch (_) {}
                return Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.success.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          LucideIcons.arrowDownCircle,
                          size: 18,
                          color: AppColors.success,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'سند قبض',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                            if (parsedDate != null) ...[
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(
                                    LucideIcons.calendar,
                                    size: 12,
                                    color: Colors.grey[400],
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    dateFormatter.format(parsedDate),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey[500],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            if (p.notes != null && p.notes!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                p.notes!,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[400],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      Text(
                        '${formatter.format(p.amount)} جنيه',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                          color: AppColors.success,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  // ===================== RETURNS TAB =====================
  Widget _buildReturnsTab(NumberFormat formatter, DateFormat dateFormatter) {
    if (_loadingReturns) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_returns.isEmpty) {
      return _buildEmptyTab(LucideIcons.rotateCcw, 'لا توجد مرتجعات');
    }
    return Column(
      children: [
        _buildTabSummary(
          icon: LucideIcons.rotateCcw,
          iconColor: AppColors.warning,
          label: '${_returns.length} مرتجع',
          totalLabel: 'إجمالي',
          total: formatter.format(_totalReturns),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadReturns,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _returns.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final r = _returns[index];
                DateTime? parsedDate;
                try {
                  parsedDate = DateTime.parse(r.createdAt ?? '');
                } catch (_) {}
                final amount = r.total > 0 ? r.total : r.totalAmount;
                return Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.warning.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          LucideIcons.rotateCcw,
                          size: 18,
                          color: AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              r.returnNumber != null
                                  ? 'مرتجع ${r.returnNumber}'
                                  : 'مرتجع #${r.id.substring(0, 8)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                            if (parsedDate != null) ...[
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(
                                    LucideIcons.calendar,
                                    size: 12,
                                    color: Colors.grey[400],
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    dateFormatter.format(parsedDate),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey[500],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            if (r.reason != null && r.reason!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                r.reason!,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[400],
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      Text(
                        '${formatter.format(amount)} جنيه',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                          color: AppColors.warning,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  // ===================== STATEMENT TAB =====================
  Widget _buildStatementTab(NumberFormat formatter, DateFormat dateFormatter) {
    if (_loadingStatement) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_entries.isEmpty) {
      return _buildEmptyTab(LucideIcons.scrollText, 'لا توجد حركات');
    }

    final totalDebit = _entries.fold<double>(0, (sum, e) => sum + e.debit);
    final totalCredit = _entries.fold<double>(0, (sum, e) => sum + e.credit);
    final lastBalance = _entries.isNotEmpty ? _entries.first.balance : 0.0;

    return Column(
      children: [
        // Summary
        // Container(
        //   margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        //   padding: const EdgeInsets.all(14),
        //   decoration: BoxDecoration(
        //     color: Colors.white,
        //     borderRadius: BorderRadius.circular(14),
        //   ),
        //   child: Row(
        //     children: [
        //       Expanded(
        //         child: Column(
        //           children: [
        //             const Icon(LucideIcons.arrowUpCircle, size: 18, color: AppColors.error),
        //             const SizedBox(height: 4),
        //             const Text('عليه', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        //             Text(
        //               formatter.format(totalDebit),
        //               style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.error),
        //             ),
        //           ],
        //         ),
        //       ),
        //       Container(width: 1, height: 40, color: Colors.grey[200]),
        //       Expanded(
        //         child: Column(
        //           children: [
        //             const Icon(LucideIcons.arrowDownCircle, size: 18, color: AppColors.success),
        //             const SizedBox(height: 4),
        //             const Text('ليه', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        //             Text(
        //               formatter.format(totalCredit),
        //               style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.success),
        //             ),
        //           ],
        //         ),
        //       ),
        //       Container(width: 1, height: 40, color: Colors.grey[200]),
        //       Expanded(
        //         child: Column(
        //           children: [
        //             const Icon(LucideIcons.wallet, size: 18, color: AppColors.primary),
        //             const SizedBox(height: 4),
        //             const Text('الرصيد', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        //             Text(
        //               formatter.format(lastBalance),
        //               style: TextStyle(
        //                 fontWeight: FontWeight.bold,
        //                 fontSize: 13,
        //                 color: lastBalance > 0 ? AppColors.error : AppColors.success,
        //               ),
        //             ),
        //           ],
        //         ),
        //       ),
        //     ],
        //   ),
        // ),

        // Table header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: AppColors.primary.withOpacity(0.05),
          child: const Row(
            children: [
              Expanded(
                flex: 2,
                child: Text(
                  'البيان',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                ),
              ),
              Expanded(
                child: Text(
                  'عليه',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    color: AppColors.error,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              Expanded(
                child: Text(
                  'ليه',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    color: AppColors.success,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              Expanded(
                child: Text(
                  'الرصيد',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ),

        // Entries
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadStatement,
            child: ListView.separated(
              padding: EdgeInsets.zero,
              itemCount: _entries.length,
              separatorBuilder: (_, __) =>
                  Divider(height: 1, color: Colors.grey[100]),
              itemBuilder: (context, index) {
                final entry = _entries[index];
                DateTime? parsedDate;
                try {
                  parsedDate = DateTime.parse(entry.date);
                } catch (_) {}

                IconData typeIcon;
                Color typeColor;
                switch (entry.type) {
                  case 'invoice':
                    typeIcon = LucideIcons.fileText;
                    typeColor = AppColors.secondary;
                    break;
                  case 'payment':
                    typeIcon = LucideIcons.creditCard;
                    typeColor = AppColors.success;
                    break;
                  case 'return':
                    typeIcon = LucideIcons.rotateCcw;
                    typeColor = AppColors.warning;
                    break;
                  default:
                    typeIcon = LucideIcons.circle;
                    typeColor = AppColors.textSecondary;
                }

                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  color: Colors.white,
                  child: Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: Row(
                          children: [
                            Icon(typeIcon, size: 14, color: typeColor),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    entry.description,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  if (parsedDate != null)
                                    Text(
                                      dateFormatter.format(parsedDate),
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: Colors.grey[400],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Text(
                          entry.debit > 0 ? formatter.format(entry.debit) : '-',
                          style: TextStyle(
                            fontSize: 12,
                            color: entry.debit > 0
                                ? AppColors.error
                                : Colors.grey[300],
                            fontWeight: entry.debit > 0
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          entry.credit > 0
                              ? formatter.format(entry.credit)
                              : '-',
                          style: TextStyle(
                            fontSize: 12,
                            color: entry.credit > 0
                                ? AppColors.success
                                : Colors.grey[300],
                            fontWeight: entry.credit > 0
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          formatter.format(entry.balance),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: entry.balance > 0
                                ? AppColors.error
                                : AppColors.success,
                          ),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  // ===================== SHARED HELPERS =====================
  Widget _buildTabSummary({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String totalLabel,
    required String total,
  }) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: iconColor.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: iconColor),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: iconColor,
                ),
              ),
            ],
          ),
          Text(
            '$total جنيه',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 15,
              color: iconColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyTab(IconData icon, String message) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 56, color: Colors.grey[300]),
          const SizedBox(height: 12),
          Text(
            message,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
