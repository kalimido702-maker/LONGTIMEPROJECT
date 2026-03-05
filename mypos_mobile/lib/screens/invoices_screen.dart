import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/invoice.dart';
import '../widgets/date_filter_widget.dart';

class InvoicesScreen extends StatefulWidget {
  final String? filterId;
  const InvoicesScreen({super.key, this.filterId});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  String _searchQuery = '';
  String _filterStatus = 'all'; // all, paid, unpaid
  late DateTime _fromDate;
  late DateTime _toDate;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _fromDate = DateTime(now.year, 1, 1);
    _toDate = DateTime(now.year, 12, 31);
    WidgetsBinding.instance.addPostFrameCallback((_) => _reloadInvoices());
  }

  Future<void> _reloadInvoices() async {
    final dataProvider = context.read<DataProvider>();
    final range = DateRange(from: _fromDate, to: _toDate);
    await dataProvider.loadInvoices(
      refresh: true,
      fromDate: range.fromParam,
      toDate: range.toParam,
    );
  }

  void _onDateChanged(DateRange range) {
    setState(() {
      _fromDate = range.from;
      _toDate = range.to;
    });
    _reloadInvoices();
  }

  @override
  Widget build(BuildContext context) {
    final dataProvider = context.watch<DataProvider>();
    final formatter = NumberFormat('#,##0.00', 'ar');
    final dateFormatter = DateFormat('yyyy/MM/dd', 'ar');

    // Only show delivered invoices (business rule)
    var invoices = dataProvider.deliveredInvoices;

    // Apply notification filter (show only specific invoice)
    if (widget.filterId != null && widget.filterId!.isNotEmpty) {
      invoices = invoices.where((i) => i.id == widget.filterId).toList();
    }

    // Apply search filter
    if (_searchQuery.isNotEmpty) {
      invoices = invoices.where((inv) {
        final q = _searchQuery.toLowerCase();
        return (inv.invoiceNumber?.toLowerCase().contains(q) ?? false) ||
            (inv.customerName?.toLowerCase().contains(q) ?? false) ||
            inv.total.toString().contains(q);
      }).toList();
    }

    // Apply payment status filter
    if (_filterStatus == 'paid') {
      invoices = invoices.where((i) => i.isPaid).toList();
    } else if (_filterStatus == 'unpaid') {
      invoices = invoices.where((i) => !i.isPaid).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('الفواتير'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'بحث عن فاتورة...',
                prefixIcon: const Icon(LucideIcons.search, size: 20, color: Colors.white70),
                filled: true,
                fillColor: Colors.white.withOpacity(0.15),
                hintStyle: const TextStyle(color: Colors.white60),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Filter chips + date filter
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _FilterChip(
                        label: 'الكل',
                        isSelected: _filterStatus == 'all',
                        count: dataProvider.deliveredInvoices.length,
                        onTap: () => setState(() => _filterStatus = 'all'),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'مدفوعة',
                        isSelected: _filterStatus == 'paid',
                        count: dataProvider.deliveredInvoices.where((i) => i.isPaid).length,
                        onTap: () => setState(() => _filterStatus = 'paid'),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'غير مدفوعة',
                        isSelected: _filterStatus == 'unpaid',
                        count: dataProvider.deliveredInvoices.where((i) => !i.isPaid).length,
                        onTap: () => setState(() => _filterStatus = 'unpaid'),
                      ),
                      const SizedBox(width: 12),
                      DateFilterWidget(
                        fromDate: _fromDate,
                        toDate: _toDate,
                        onChanged: _onDateChanged,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Invoice list
          Expanded(
            child: dataProvider.isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : invoices.isEmpty
                    ? _buildEmptyState()
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: invoices.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final invoice = invoices[index];
                          return _InvoiceCard(
                            invoice: invoice,
                            formatter: formatter,
                            dateFormatter: dateFormatter,
                            onTap: () => context.go('/invoices/${invoice.id}'),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.fileX, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا توجد فواتير',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _searchQuery.isNotEmpty
                ? 'لم يتم العثور على نتائج للبحث'
                : 'لم يتم العثور على فواتير مسلمة',
            style: TextStyle(fontSize: 14, color: Colors.grey[400]),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final int count;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.count,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.grey[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : AppColors.textSecondary,
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white.withOpacity(0.2) : Colors.grey[200],
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  color: isSelected ? Colors.white : AppColors.textSecondary,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  final Invoice invoice;
  final NumberFormat formatter;
  final DateFormat dateFormatter;
  final VoidCallback onTap;

  const _InvoiceCard({
    required this.invoice,
    required this.formatter,
    required this.dateFormatter,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isPaid = invoice.isPaid;
    final statusColor = isPaid ? AppColors.success : AppColors.warning;
    final statusText = isPaid ? 'مدفوعة' : 'غير مدفوعة';

    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(invoice.createdAt ?? '');
    } catch (_) {}

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(LucideIcons.receipt, size: 20, color: AppColors.secondary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'فاتورة ${invoice.invoiceNumber ?? '#${invoice.id.substring(0, 8)}'}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                        if (invoice.customerName != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            invoice.customerName!,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${formatter.format(invoice.total)} جنيه',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          statusText,
                          style: TextStyle(
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              if (parsedDate != null || invoice.remainingAmount > 0) ...[
                const SizedBox(height: 10),
                const Divider(height: 1),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (parsedDate != null)
                      Row(
                        children: [
                          Icon(LucideIcons.calendar, size: 14, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Text(
                            dateFormatter.format(parsedDate),
                            style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                          ),
                        ],
                      ),
                    if (invoice.remainingAmount > 0)
                      Text(
                        'المتبقي: ${formatter.format(invoice.remainingAmount)} جنيه',
                        style: const TextStyle(
                          fontSize: 12,
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
}
