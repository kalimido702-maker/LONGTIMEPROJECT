import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/supervisor.dart';

/// Supervisors list screen for admin role.
class SupervisorsScreen extends StatefulWidget {
  const SupervisorsScreen({super.key});

  @override
  State<SupervisorsScreen> createState() => _SupervisorsScreenState();
}

class _SupervisorsScreenState extends State<SupervisorsScreen> {
  String _searchQuery = '';
  bool _initialLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    final dp = context.read<DataProvider>();
    await dp.loadSupervisors(search: _searchQuery.isEmpty ? null : _searchQuery);
    if (mounted) setState(() => _initialLoaded = true);
  }

  @override
  Widget build(BuildContext context) {
    final dp = context.watch<DataProvider>();
    var supervisors = dp.supervisors;

    if (_searchQuery.isNotEmpty) {
      supervisors = supervisors.where((s) {
        final q = _searchQuery.toLowerCase();
        return s.name.toLowerCase().contains(q) ||
            (s.phone?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('المشرفين'),
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
                hintText: 'بحث عن مشرف...',
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
            : supervisors.isEmpty
                ? _buildEmptyState()
                : _buildSupervisorsList(supervisors),
      ),
    );
  }

  Widget _buildSupervisorsList(List<Supervisor> supervisors) {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final totalDebt = supervisors.fold<double>(0, (sum, s) => sum + s.totalDebt);
    final totalReps = supervisors.fold<int>(0, (sum, s) => sum + s.salesRepCount);
    final totalCustomers = supervisors.fold<int>(0, (sum, s) => sum + s.customerCount);

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // Total debt summary card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF6C5CE7), Color(0xFF8B7CF6)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6C5CE7).withOpacity(0.3),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              Row(
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
                ],
              ),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _summaryChip(LucideIcons.shield, '${supervisors.length}', 'مشرف'),
                  _summaryChip(LucideIcons.briefcase, '$totalReps', 'مندوب'),
                  _summaryChip(LucideIcons.users, '$totalCustomers', 'عميل'),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Supervisors list
        ...supervisors.map((sup) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _SupervisorCard(
            supervisor: sup,
            onTap: () => context.go('/supervisors/${sup.id}'),
          ),
        )),
      ],
    );
  }

  Widget _summaryChip(IconData icon, String value, String label) {
    return Column(
      children: [
        Icon(icon, size: 16, color: Colors.white70),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11)),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.shield, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا يوجد مشرفين',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}

class _SupervisorCard extends StatelessWidget {
  final Supervisor supervisor;
  final VoidCallback onTap;

  const _SupervisorCard({required this.supervisor, required this.onTap});

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
                  color: AppColors.warning.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    supervisor.name.isNotEmpty ? supervisor.name[0] : '?',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.warning,
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
                      supervisor.name,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (supervisor.phone != null && supervisor.phone!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(LucideIcons.phone, size: 13, color: Colors.grey[400]),
                          const SizedBox(width: 4),
                          Text(supervisor.phone!, style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                        ],
                      ),
                    ],
                  ],
                ),
              ),

              // Stats
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${supervisor.salesRepCount}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.secondary),
                      ),
                      const SizedBox(width: 3),
                      Text('مندوب', style: TextStyle(fontSize: 10, color: Colors.grey[500])),
                      const SizedBox(width: 8),
                      Text(
                        '${supervisor.customerCount}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.primary),
                      ),
                      const SizedBox(width: 3),
                      Text('عميل', style: TextStyle(fontSize: 10, color: Colors.grey[500])),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    NumberFormat('#,##0.00', 'ar').format(supervisor.totalDebt),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: supervisor.totalDebt > 0 ? AppColors.error : AppColors.success,
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
