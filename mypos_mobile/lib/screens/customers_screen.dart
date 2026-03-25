import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/customer.dart';

/// Customers list screen for sales_rep & supervisor roles.
/// Shows a searchable list of their assigned customers.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  String _searchQuery = '';
  bool _initialLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadCustomers());
  }

  Future<void> _loadCustomers() async {
    final dataProvider = context.read<DataProvider>();
    await dataProvider.loadCustomers(search: _searchQuery.isEmpty ? null : _searchQuery);
    if (mounted) setState(() => _initialLoaded = true);
  }

  @override
  Widget build(BuildContext context) {
    final dataProvider = context.watch<DataProvider>();
    final formatter = NumberFormat('#,##0.00', 'ar');

    var customers = dataProvider.customers;

    // Local search filter (in addition to server-side)
    if (_searchQuery.isNotEmpty) {
      customers = customers.where((c) {
        final q = _searchQuery.toLowerCase();
        return c.name.toLowerCase().contains(q) ||
            (c.phone?.toLowerCase().contains(q) ?? false) ||
            (c.address?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('العملاء'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) {
                setState(() => _searchQuery = v);
                // Debounce: reload from server after typing stops
                Future.delayed(const Duration(milliseconds: 500), () {
                  if (_searchQuery == v) {
                    _loadCustomers();
                  }
                });
              },
              decoration: InputDecoration(
                hintText: 'بحث عن عميل...',
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
      body: RefreshIndicator(
        onRefresh: _loadCustomers,
        color: AppColors.primary,
        child: (!_initialLoaded && dataProvider.isLoading)
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : customers.isEmpty
                ? _buildEmptyState()
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: customers.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final customer = customers[index];
                      return _CustomerCard(
                        customer: customer,
                        formatter: formatter,
                        onTap: () => context.go('/customers/${customer.id}'),
                      );
                    },
                  ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.users, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا يوجد عملاء',
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
                : 'لا يوجد عملاء مرتبطين بحسابك',
            style: TextStyle(fontSize: 14, color: Colors.grey[400]),
          ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final Customer customer;
  final NumberFormat formatter;
  final VoidCallback onTap;

  const _CustomerCard({
    required this.customer,
    required this.formatter,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final balance = customer.currentBalance;
    final balanceColor = balance > 0 ? AppColors.error : AppColors.success;

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
              // Avatar
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    customer.name.isNotEmpty ? customer.name[0] : '?',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),

              // Name & details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      customer.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (customer.phone != null && customer.phone!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(LucideIcons.phone, size: 13, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Text(
                            customer.phone!,
                            style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                          ),
                        ],
                      ),
                    ],
                    if (customer.address != null && customer.address!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(LucideIcons.mapPin, size: 13, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              customer.address!,
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

              // Balance
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${formatter.format(balance.abs())}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: balanceColor,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    balance > 0 ? 'مدين' : balance < 0 ? 'دائن' : 'صفر',
                    style: TextStyle(
                      fontSize: 11,
                      color: balanceColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 4),
              Icon(LucideIcons.chevronLeft, size: 18, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
