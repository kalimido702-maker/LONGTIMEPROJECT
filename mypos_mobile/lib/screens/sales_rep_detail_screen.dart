import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../models/sales_rep.dart';
import '../models/customer.dart';
import '../services/api_service.dart';

/// Drill-down screen: shows a sales rep's info + their customers list.
/// Tapping a customer navigates to CustomerDetailScreen.
class SalesRepDetailScreen extends StatefulWidget {
  final String salesRepId;
  const SalesRepDetailScreen({super.key, required this.salesRepId});

  @override
  State<SalesRepDetailScreen> createState() => _SalesRepDetailScreenState();
}

class _SalesRepDetailScreenState extends State<SalesRepDetailScreen> {
  final ApiService _api = ApiService();
  SalesRep? _rep;
  List<Customer> _customers = [];
  bool _loading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      // Load sales rep info
      final repRes = await _api.getSalesReps(search: '', limit: 500);
      final repData = repRes['data'] as List? ?? [];
      for (final item in repData) {
        final r = SalesRep.fromJson(item as Map<String, dynamic>);
        if (r.id == widget.salesRepId) {
          _rep = r;
          break;
        }
      }

      // Load this rep's customers
      final custRes = await _api.getCustomers(salesRepId: widget.salesRepId, limit: 500);
      final custData = custRes['data'] as List? ?? [];
      _customers = custData.map((j) => Customer.fromJson(j as Map<String, dynamic>)).toList();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat('#,##0.00', 'ar');

    var filteredCustomers = _customers;
    if (_searchQuery.isNotEmpty) {
      filteredCustomers = _customers.where((c) {
        final q = _searchQuery.toLowerCase();
        return c.name.toLowerCase().contains(q) ||
            (c.phone?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => context.pop(),
        ),
        title: Text(_rep?.name ?? 'مندوب المبيعات'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'بحث في العملاء...',
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
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _loadData,
              child: Column(
                children: [
                  // Rep info card
                  if (_rep != null) _buildRepHeader(),

                  // Customers
                  Expanded(
                    child: filteredCustomers.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(LucideIcons.users, size: 56, color: Colors.grey[300]),
                                const SizedBox(height: 12),
                                Text('لا يوجد عملاء', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey[500])),
                              ],
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            itemCount: filteredCustomers.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final customer = filteredCustomers[index];
                              return _buildCustomerCard(customer, formatter);
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildRepHeader() {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final totalDebt = _customers.fold<double>(0, (sum, c) => sum + c.currentBalance);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.secondary, Color(0xFF4A8FE7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    _rep!.name.isNotEmpty ? _rep!.name[0] : '?',
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_rep!.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    if (_rep!.phone != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.phone, size: 13, color: Colors.white60),
                            const SizedBox(width: 4),
                            Text(_rep!.phone!, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Column(
                children: [
                  Text(
                    '${_customers.length}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 24),
                  ),
                  const Text('\u0639\u0645\u064a\u0644', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                const Icon(LucideIcons.wallet, size: 16, color: Colors.white70),
                const SizedBox(width: 8),
                Text('\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u062f\u064a\u0648\u0646\u064a\u0629', style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                const Spacer(),
                Text(
                  '${formatter.format(totalDebt)} \u062c\u0646\u064a\u0647',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomerCard(Customer customer, NumberFormat formatter) {
    final balance = customer.currentBalance;
    final balanceColor = balance > 0 ? AppColors.error : AppColors.success;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.push('/customers/${customer.id}'),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    customer.name.isNotEmpty ? customer.name[0] : '?',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.primary),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(customer.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    if (customer.phone != null && customer.phone!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(customer.phone!, style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${formatter.format(balance.abs())}',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: balanceColor),
                  ),
                  Text(
                    balance > 0 ? 'عليه' : balance < 0 ? 'ليه' : 'صفر',
                    style: TextStyle(fontSize: 10, color: balanceColor),
                  ),
                ],
              ),
              const SizedBox(width: 4),
              Icon(LucideIcons.chevronLeft, size: 16, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
