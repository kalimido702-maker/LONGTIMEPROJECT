import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/sales_return.dart';
import '../widgets/date_filter_widget.dart';

class ReturnsScreen extends StatefulWidget {
  final String? filterId;
  const ReturnsScreen({super.key, this.filterId});

  @override
  State<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends State<ReturnsScreen> {
  String _searchQuery = '';
  late DateTime _fromDate;
  late DateTime _toDate;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _fromDate = DateTime(now.year, 1, 1);
    _toDate = DateTime(now.year, 12, 31);
    WidgetsBinding.instance.addPostFrameCallback((_) => _reloadReturns());
  }

  Future<void> _reloadReturns() async {
    final dataProvider = context.read<DataProvider>();
    final range = DateRange(from: _fromDate, to: _toDate);
    await dataProvider.loadReturns(
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
    _reloadReturns();
  }

  @override
  Widget build(BuildContext context) {
    final dataProvider = context.watch<DataProvider>();
    final formatter = NumberFormat('#,##0.00', 'ar');
    final dateFormatter = DateFormat('yyyy/MM/dd', 'ar');

    var returns = dataProvider.returns;

    // Apply notification filter (show only specific return)
    if (widget.filterId != null && widget.filterId!.isNotEmpty) {
      returns = returns.where((r) => r.id == widget.filterId).toList();
    }

    if (_searchQuery.isNotEmpty) {
      returns = returns.where((r) {
        final q = _searchQuery.toLowerCase();
        return (r.returnNumber?.toLowerCase().contains(q) ?? false) ||
            (r.customerName?.toLowerCase().contains(q) ?? false) ||
            r.totalAmount.toString().contains(q);
      }).toList();
    }

    final totalReturns = returns.fold<double>(
      0,
      (sum, r) => sum + (r.total > 0 ? r.total : r.totalAmount),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('المرتجعات'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'بحث في المرتجعات...',
                prefixIcon: const Icon(LucideIcons.search, size: 20, color: Colors.white70),
                filled: true,
                fillColor: Colors.white.withOpacity(0.15),
                hintStyle: const TextStyle(color: Colors.white60),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
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
          // Summary
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.warning, AppColors.warning.withOpacity(0.8)],
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(LucideIcons.rotateCcw, color: Colors.white, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('إجمالي المرتجعات', style: TextStyle(color: Colors.white70, fontSize: 13)),
                        const SizedBox(height: 2),
                        Text(
                          '${returns.length} مرتجع',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15),
                        ),
                      ],
                    ),
                  ],
                ),
                Text(
                  '${formatter.format(totalReturns)} جنيه',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
          ),

          // Date filter
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
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
          const SizedBox(height: 8),

          Expanded(
            child: dataProvider.isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : returns.isEmpty
                    ? _buildEmptyState()
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: returns.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final ret = returns[index];
                          return _ReturnCard(
                            salesReturn: ret,
                            formatter: formatter,
                            dateFormatter: dateFormatter,
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
          Icon(LucideIcons.rotateCcw, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا توجد مرتجعات',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}

class _ReturnCard extends StatelessWidget {
  final SalesReturn salesReturn;
  final NumberFormat formatter;
  final DateFormat dateFormatter;

  const _ReturnCard({
    required this.salesReturn,
    required this.formatter,
    required this.dateFormatter,
  });

  @override
  Widget build(BuildContext context) {
    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(salesReturn.createdAt ?? '');
    } catch (_) {}

    final amount = salesReturn.total > 0 ? salesReturn.total : salesReturn.totalAmount;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.warning.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.rotateCcw, size: 22, color: AppColors.warning),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  salesReturn.returnNumber != null
                      ? 'مرتجع ${salesReturn.returnNumber}'
                      : 'مرتجع #${salesReturn.id.substring(0, 8)}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                ),
                if (salesReturn.customerName != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    salesReturn.customerName!,
                    style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                  ),
                ],
                if (parsedDate != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(LucideIcons.calendar, size: 13, color: Colors.grey[400]),
                      const SizedBox(width: 4),
                      Text(
                        dateFormatter.format(parsedDate),
                        style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                      ),
                    ],
                  ),
                ],
                if (salesReturn.reason != null && salesReturn.reason!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(LucideIcons.messageSquare, size: 13, color: Colors.grey[400]),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          salesReturn.reason!,
                          style: TextStyle(fontSize: 12, color: Colors.grey[400]),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          Text(
            '${formatter.format(amount)} جنيه',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
              color: AppColors.warning,
            ),
          ),
        ],
      ),
    );
  }
}
