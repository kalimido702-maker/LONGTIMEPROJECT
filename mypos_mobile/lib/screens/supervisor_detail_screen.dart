import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../models/supervisor.dart';
import '../models/sales_rep.dart';
import '../services/api_service.dart';

/// Drill-down screen: shows a supervisor's info + their sales reps list.
/// Tapping a sales rep navigates to SalesRepDetailScreen.
class SupervisorDetailScreen extends StatefulWidget {
  final String supervisorId;
  const SupervisorDetailScreen({super.key, required this.supervisorId});

  @override
  State<SupervisorDetailScreen> createState() => _SupervisorDetailScreenState();
}

class _SupervisorDetailScreenState extends State<SupervisorDetailScreen> {
  final ApiService _api = ApiService();
  Supervisor? _supervisor;
  List<SalesRep> _reps = [];
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
      // Load supervisor info
      final supRes = await _api.getSupervisors(search: '', limit: 500);
      final supData = supRes['data'] as List? ?? [];
      for (final item in supData) {
        final s = Supervisor.fromJson(item as Map<String, dynamic>);
        if (s.id == widget.supervisorId) {
          _supervisor = s;
          break;
        }
      }

      // Load this supervisor's sales reps
      final repRes = await _api.getSalesReps(supervisorId: widget.supervisorId, limit: 500);
      final repData = repRes['data'] as List? ?? [];
      _reps = repData.map((j) => SalesRep.fromJson(j as Map<String, dynamic>)).toList();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    var filteredReps = _reps;
    if (_searchQuery.isNotEmpty) {
      filteredReps = _reps.where((r) {
        final q = _searchQuery.toLowerCase();
        return r.name.toLowerCase().contains(q) ||
            (r.phone?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => context.pop(),
        ),
        title: Text(_supervisor?.name ?? 'المشرف'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'بحث في المندوبين...',
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
                  // Supervisor info card
                  if (_supervisor != null) _buildSupervisorHeader(),

                  // Sales reps list
                  Expanded(
                    child: filteredReps.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(LucideIcons.briefcase, size: 56, color: Colors.grey[300]),
                                const SizedBox(height: 12),
                                Text('لا يوجد مندوبين', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey[500])),
                              ],
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            itemCount: filteredReps.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final rep = filteredReps[index];
                              return _buildRepCard(rep);
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildSupervisorHeader() {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final totalDebt = _reps.fold<double>(0, (sum, r) => sum + r.totalDebt);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF6C5CE7), Color(0xFF8B7CF6)],
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
                    _supervisor!.name.isNotEmpty ? _supervisor!.name[0] : '?',
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_supervisor!.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    if (_supervisor!.phone != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.phone, size: 13, color: Colors.white60),
                            const SizedBox(width: 4),
                            Text(_supervisor!.phone!, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Column(
                    children: [
                      Text('${_reps.length}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
                      const Text('\u0645\u0646\u062f\u0648\u0628', style: TextStyle(color: Colors.white70, fontSize: 11)),
                    ],
                  ),
                  const SizedBox(width: 20),
                  Column(
                    children: [
                      Text(
                        '${_supervisor?.customerCount ?? 0}',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
                      ),
                      const Text('\u0639\u0645\u064a\u0644', style: TextStyle(color: Colors.white70, fontSize: 11)),
                    ],
                  ),
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

  Widget _buildRepCard(SalesRep rep) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.push('/sales-reps/${rep.id}'),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.secondary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    rep.name.isNotEmpty ? rep.name[0] : '?',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.secondary),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rep.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    if (rep.phone != null && rep.phone!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(rep.phone!, style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${rep.customerCount} عميل',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
                ),
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
