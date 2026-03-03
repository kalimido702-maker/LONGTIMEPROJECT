import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/sales_rep.dart';

/// Sales reps list screen for supervisor & admin roles.
class SalesRepsScreen extends StatefulWidget {
  const SalesRepsScreen({super.key});

  @override
  State<SalesRepsScreen> createState() => _SalesRepsScreenState();
}

class _SalesRepsScreenState extends State<SalesRepsScreen> {
  String _searchQuery = '';
  bool _initialLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    final dp = context.read<DataProvider>();
    await dp.loadSalesReps(search: _searchQuery.isEmpty ? null : _searchQuery);
    if (mounted) setState(() => _initialLoaded = true);
  }

  @override
  Widget build(BuildContext context) {
    final dp = context.watch<DataProvider>();
    var reps = dp.salesReps;

    if (_searchQuery.isNotEmpty) {
      reps = reps.where((r) {
        final q = _searchQuery.toLowerCase();
        return r.name.toLowerCase().contains(q) ||
            (r.phone?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('المندوبين'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) {
                setState(() => _searchQuery = v);
                Future.delayed(const Duration(milliseconds: 500), () {
                  if (_searchQuery == v) _loadData();
                });
              },
              decoration: InputDecoration(
                hintText: 'بحث عن مندوب...',
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
        onRefresh: _loadData,
        color: AppColors.primary,
        child: (!_initialLoaded && dp.isLoading)
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : reps.isEmpty
                ? _buildEmptyState()
                : _buildRepsList(reps),
      ),
    );
  }

  Widget _buildRepsList(List<SalesRep> reps) {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final totalDebt = reps.fold<double>(0, (sum, r) => sum + r.totalDebt);

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // Total debt summary card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.secondary, Color(0xFF4A8FE7)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppColors.secondary.withOpacity(0.3),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(LucideIcons.wallet, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('إجمالي مديونية العملاء', style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 13)),
                    const SizedBox(height: 6),
                    Text(
                      '${formatter.format(totalDebt)} جنيه',
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
              Column(
                children: [
                  Text('${reps.length}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 22)),
                  Text('مندوب', style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Reps list
        ...reps.map((rep) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _SalesRepCard(
            rep: rep,
            onTap: () => context.go('/sales-reps/${rep.id}'),
          ),
        )),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.userCheck, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا يوجد مندوبين',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.grey[500]),
          ),
          const SizedBox(height: 8),
          Text(
            _searchQuery.isNotEmpty ? 'لم يتم العثور على نتائج' : 'لا يوجد مندوبين مرتبطين',
            style: TextStyle(fontSize: 14, color: Colors.grey[400]),
          ),
        ],
      ),
    );
  }
}

class _SalesRepCard extends StatelessWidget {
  final SalesRep rep;
  final VoidCallback onTap;

  const _SalesRepCard({required this.rep, required this.onTap});

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
              // Avatar
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.secondary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    rep.name.isNotEmpty ? rep.name[0] : '?',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.secondary,
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
                      rep.name,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (rep.phone != null && rep.phone!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(LucideIcons.phone, size: 13, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Text(rep.phone!, style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                        ],
                      ),
                    ],
                    if (rep.supervisorName != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(LucideIcons.shield, size: 13, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Text(rep.supervisorName!, style: TextStyle(fontSize: 12, color: Colors.grey[400])),
                        ],
                      ),
                    ],
                  ],
                ),
              ),

              // Customer count & debt
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${rep.customerCount} عميل',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    NumberFormat('#,##0.00', 'ar').format(rep.totalDebt),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: rep.totalDebt > 0 ? AppColors.error : AppColors.success,
                    ),
                  ),
                  Text(
                    'مديونية',
                    style: TextStyle(fontSize: 10, color: Colors.grey[500]),
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
