import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../providers/data_provider.dart';
import '../models/invoice.dart';
import '../services/invoice_pdf_service.dart';

class InvoiceDetailScreen extends StatefulWidget {
  final String invoiceId;
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice? _invoice;
  bool _isLoading = true;
  bool _isSharing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadInvoice());
  }

  Future<void> _loadInvoice() async {
    final dataProvider = context.read<DataProvider>();

    // First try to find in loaded list (quick display)
    final fromList = dataProvider.invoices.where((i) => i.id == widget.invoiceId);
    if (fromList.isNotEmpty) {
      setState(() {
        _invoice = fromList.first;
      });
    }

    // Then fetch full detail with items from API
    final detail = await dataProvider.getInvoiceDetail(widget.invoiceId);
    if (detail != null && mounted) {
      setState(() {
        _invoice = detail;
        _isLoading = false;
      });
    } else if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _shareInvoice(Invoice invoice) async {
    setState(() => _isSharing = true);
    try {
      await InvoicePdfService.shareInvoice(invoice);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('حدث خطأ أثناء إنشاء PDF: $e'), backgroundColor: AppColors.error),
        );
      }
    }
    if (mounted) setState(() => _isSharing = false);
  }

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat('#,##0.00', 'ar');
    final dateFormatter = DateFormat('yyyy/MM/dd HH:mm', 'ar');

    if (_isLoading && _invoice == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('تفاصيل الفاتورة')),
        body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    final invoice = _invoice;
    if (invoice == null || invoice.id.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('تفاصيل الفاتورة')),
        body: const Center(child: Text('الفاتورة غير موجودة')),
      );
    }

    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(invoice.createdAt ?? '');
    } catch (_) {}

    final isPaid = invoice.isPaid;

    return Scaffold(
      appBar: AppBar(
        title: Text('فاتورة ${invoice.invoiceNumber ?? ''}'),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            onPressed: _isSharing ? null : () => _shareInvoice(invoice),
            icon: _isSharing
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                : const Icon(LucideIcons.share2, size: 20),
            tooltip: 'مشاركة الفاتورة PDF',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Invoice Header Card
          Container(
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
                // Status badge
                // Container(
                //   padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                //   decoration: BoxDecoration(
                //     color: (isPaid ? AppColors.success : AppColors.warning).withOpacity(0.1),
                //     borderRadius: BorderRadius.circular(20),
                //   ),
                //   child: Row(
                //     mainAxisSize: MainAxisSize.min,
                //     children: [
                //       Icon(
                //         isPaid ? LucideIcons.checkCircle : LucideIcons.clock,
                //         size: 16,
                //         color: isPaid ? AppColors.success : AppColors.warning,
                //       ),
                //       const SizedBox(width: 6),
                //       Text(
                //         isPaid ? 'مدفوعة بالكامل' : 'غير مدفوعة بالكامل',
                //         style: TextStyle(
                //           color: isPaid ? AppColors.success : AppColors.warning,
                //           fontWeight: FontWeight.w600,
                //           fontSize: 14,
                //         ),
                //       ),
                //     ],
                //   ),
                // ),
                // const SizedBox(height: 20),

                // Total
                Text(
                  '${formatter.format(invoice.total)} جنيه',
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 20),

                // Details rows
                _DetailRow(
                  label: 'رقم الفاتورة',
                  value: invoice.invoiceNumber ?? invoice.id,
                  icon: LucideIcons.hash,
                ),
                if (invoice.customerName != null)
                  _DetailRow(
                    label: 'العميل',
                    value: invoice.customerName!,
                    icon: LucideIcons.user,
                  ),
                if (parsedDate != null)
                  _DetailRow(
                    label: 'التاريخ',
                    value: dateFormatter.format(parsedDate),
                    icon: LucideIcons.calendar,
                  ),
                _DetailRow(
                  label: 'حالة التسليم',
                  value: _getDeliveryLabel(invoice.deliveryStatus),
                  icon: LucideIcons.truck,
                ),
                _DetailRow(
                  label: 'المبلغ المدفوع',
                  value: '${formatter.format(invoice.paidAmount)} جنيه',
                  icon: LucideIcons.creditCard,
                  valueColor: AppColors.success,
                ),
                if (invoice.remainingAmount > 0)
                  _DetailRow(
                    label: 'المبلغ المتبقي',
                    value: '${formatter.format(invoice.remainingAmount)} جنيه',
                    icon: LucideIcons.alertCircle,
                    valueColor: AppColors.error,
                  ),
                if (invoice.discount > 0)
                  _DetailRow(
                    label: 'الخصم',
                    value: '${formatter.format(invoice.discount)} جنيه',
                    icon: LucideIcons.tag,
                  ),
                if (invoice.tax > 0)
                  _DetailRow(
                    label: 'الضريبة',
                    value: '${formatter.format(invoice.tax)} جنيه',
                    icon: LucideIcons.percent,
                  ),
                if (invoice.notes != null && invoice.notes!.isNotEmpty)
                  _DetailRow(
                    label: 'ملاحظات',
                    value: invoice.notes!,
                    icon: LucideIcons.stickyNote,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Invoice Items
          if (invoice.items.isNotEmpty) ...[
            Text(
              'أصناف الفاتورة',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 12),
            Container(
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
                  // Table header
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.05),
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(16),
                        topRight: Radius.circular(16),
                      ),
                    ),
                    child: const Row(
                      children: [
                        Expanded(flex: 3, child: Text('الصنف', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                        Expanded(flex: 1, child: Text('الكمية', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13), textAlign: TextAlign.center)),
                        Expanded(flex: 2, child: Text('السعر', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13), textAlign: TextAlign.center)),
                        Expanded(flex: 2, child: Text('الإجمالي', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13), textAlign: TextAlign.end)),
                      ],
                    ),
                  ),

                  // Table rows
                  ...invoice.items.asMap().entries.map((entry) {
                    final i = entry.key;
                    final item = entry.value;
                    final isLast = i == invoice.items.length - 1;
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        border: isLast ? null : Border(bottom: BorderSide(color: Colors.grey[100]!)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: Text(
                              item.name.isNotEmpty ? item.name : 'صنف',
                              style: const TextStyle(fontSize: 13),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Expanded(
                            flex: 1,
                            child: Text(
                              '${item.quantity}',
                              style: const TextStyle(fontSize: 13),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: Text(
                              formatter.format(item.price),
                              style: const TextStyle(fontSize: 13),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: Text(
                              formatter.format(item.total),
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              textAlign: TextAlign.end,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),

                  // Summary row
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.05),
                      borderRadius: const BorderRadius.only(
                        bottomLeft: Radius.circular(16),
                        bottomRight: Radius.circular(16),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'الإجمالي',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                        ),
                        Text(
                          '${formatter.format(invoice.total)} جنيه',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _getDeliveryLabel(String? status) {
    switch (status) {
      case 'delivered':
        return 'تم التسليم';
      case 'pending':
        return 'قيد الانتظار';
      case 'partial':
        return 'تسليم جزئي';
      default:
        return status ?? '-';
    }
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  const _DetailRow({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.textSecondary),
          const SizedBox(width: 10),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 14,
            ),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: valueColor ?? AppColors.textPrimary,
              ),
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
