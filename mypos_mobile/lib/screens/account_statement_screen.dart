import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/account_entry.dart';

class AccountStatementScreen extends StatefulWidget {
  const AccountStatementScreen({super.key});

  @override
  State<AccountStatementScreen> createState() => _AccountStatementScreenState();
}

class _AccountStatementScreenState extends State<AccountStatementScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadStatement());
  }

  Future<void> _loadStatement() async {
    final dataProvider = context.read<DataProvider>();

    await dataProvider.loadAccountStatement(
      customerId: null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final dataProvider = context.watch<DataProvider>();
    final formatter = NumberFormat('#,##0.00', 'ar');
    final dateFormatter = DateFormat('yyyy/MM/dd', 'ar');

    final entries = dataProvider.accountEntries;

    // Calculate totals
    final balance = entries.isNotEmpty ? entries.first.balance : 0.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('كشف الحساب'),
      ),
      body: dataProvider.isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : Column(
              children: [
                // Summary header
                Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(20),
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
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(LucideIcons.wallet, size: 20, color: AppColors.primary),
                          const SizedBox(width: 8),
                          const Text(
                            'الرصيد: ',
                            style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
                          ),
                          Text(
                            '${formatter.format(balance)} جنيه',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: balance > 0 ? AppColors.error : AppColors.success,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Table header
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  color: AppColors.primary.withOpacity(0.05),
                  child: const Row(
                    children: [
                      Expanded(flex: 2, child: Text('البيان', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                      Expanded(child: Text('مدين', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.error), textAlign: TextAlign.center)),
                      Expanded(child: Text('دائن', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.success), textAlign: TextAlign.center)),
                      Expanded(child: Text('الرصيد', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13), textAlign: TextAlign.end)),
                    ],
                  ),
                ),

                // Entries list
                Expanded(
                  child: entries.isEmpty
                      ? _buildEmptyState()
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 0),
                          itemCount: entries.length,
                          separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey[100]),
                          itemBuilder: (context, index) {
                            final entry = entries[index];
                            return _EntryRow(
                              entry: entry,
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
          Icon(LucideIcons.scrollText, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا توجد حركات',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  final AccountEntry entry;
  final NumberFormat formatter;
  final DateFormat dateFormatter;

  const _EntryRow({
    required this.entry,
    required this.formatter,
    required this.dateFormatter,
  });

  @override
  Widget build(BuildContext context) {
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
      case 'bonus':
        typeIcon = LucideIcons.gift;
        typeColor = AppColors.success;
        break;
      case 'opening_balance':
        typeIcon = LucideIcons.wallet;
        typeColor = AppColors.primary;
        break;
      default:
        typeIcon = LucideIcons.circle;
        typeColor = AppColors.textSecondary;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: Colors.white,
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 2,
                child: Row(
                  children: [
                    Icon(typeIcon, size: 16, color: typeColor),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            entry.description,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (parsedDate != null)
                            Text(
                              dateFormatter.format(parsedDate),
                              style: TextStyle(fontSize: 11, color: Colors.grey[400]),
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
                    fontSize: 13,
                    color: entry.debit > 0 ? AppColors.error : Colors.grey[300],
                    fontWeight: entry.debit > 0 ? FontWeight.w600 : FontWeight.normal,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              Expanded(
                child: Text(
                  entry.credit > 0 ? formatter.format(entry.credit) : '-',
                  style: TextStyle(
                    fontSize: 13,
                    color: entry.credit > 0 ? AppColors.success : Colors.grey[300],
                    fontWeight: entry.credit > 0 ? FontWeight.w600 : FontWeight.normal,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              Expanded(
                child: Text(
                  formatter.format(entry.balance),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: entry.balance > 0 ? AppColors.error : AppColors.success,
                  ),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
