import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../config/theme.dart';

class CreatePaymentScreen extends StatefulWidget {
  final Map<String, dynamic>? customer;
  final Map<String, dynamic>? invoice;

  const CreatePaymentScreen({super.key, this.customer, this.invoice});

  @override
  State<CreatePaymentScreen> createState() => _CreatePaymentScreenState();
}

class _CreatePaymentScreenState extends State<CreatePaymentScreen> {
  final _amountController = TextEditingController();
  final _referenceController = TextEditingController();
  final _notesController = TextEditingController();

  bool _isLoading = false;
  bool _isSaving = false;

  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _paymentMethods = [];
  List<Map<String, dynamic>> _unpaidInvoices = [];

  Map<String, dynamic>? _selectedCustomer;
  Map<String, dynamic>? _selectedPaymentMethod;
  Map<String, dynamic>? _selectedInvoice;
  DateTime _paymentDate = DateTime.now();

  final _fmt = NumberFormat('#,##0.##', 'ar');

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final customersRes = await api.getCustomers();
      final paymentMethods = await api.getPaymentMethods();
      setState(() {
        final cd = customersRes['data'] as List? ?? [];
        _customers = cd.cast<Map<String, dynamic>>();
        _paymentMethods = paymentMethods;
        if (_paymentMethods.isNotEmpty) _selectedPaymentMethod = _paymentMethods.first;
        if (widget.customer != null) {
          _selectedCustomer = _customers.firstWhere(
            (c) => c['id'].toString() == widget.customer!['id'].toString(),
            orElse: () => widget.customer!,
          );
        }
        if (widget.invoice != null) {
          _selectedInvoice = widget.invoice;
          final remaining = widget.invoice!['remaining_amount'] ?? widget.invoice!['remainingAmount'];
          if (remaining != null) _amountController.text = remaining.toString();
        }
      });
      if (_selectedCustomer != null) await _loadUnpaidInvoices();
    } catch (e) {
      _showSnack('فشل تحميل البيانات: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadUnpaidInvoices() async {
    if (_selectedCustomer == null) return;
    try {
      final api = ApiService();
      final res = await api.getInvoices(
        customerId: _selectedCustomer!['id'].toString(),
        paymentStatus: 'unpaid',
      );
      final data = res['data'] as List? ?? [];
      setState(() => _unpaidInvoices = data.cast<Map<String, dynamic>>());
    } catch (_) {
      setState(() => _unpaidInvoices = []);
    }
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) { _showSnack('أدخل مبلغاً صحيحاً', isError: true); return; }
    if (_selectedCustomer == null) { _showSnack('اختر العميل', isError: true); return; }
    setState(() => _isSaving = true);
    try {
      final api = ApiService();
      await api.createPayment({
        'customer_id': _selectedCustomer!['id'],
        'customer_name': _selectedCustomer!['name'],
        'invoice_id': _selectedInvoice?['id'],
        'amount': amount,
        'payment_method_id': _selectedPaymentMethod?['id'],
        'payment_method_name': _selectedPaymentMethod?['name'],
        'payment_date': _paymentDate.toIso8601String(),
        'reference_number': _referenceController.text.trim(),
        'notes': _notesController.text.trim(),
        'payment_type': 'receipt',
      });
      _showSnack('تم إضافة القبض بنجاح');
      if (mounted) context.pop();
    } catch (e) {
      _showSnack('فشل إضافة القبض: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.cairo()),
      backgroundColor: isError ? AppColors.error : AppColors.success,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('إضافة قبض'),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text('حفظ', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('بيانات القبض', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      // Customer
                      DropdownButtonFormField<Map<String, dynamic>>(
                        value: _selectedCustomer,
                        decoration: const InputDecoration(labelText: 'العميل *', prefixIcon: Icon(LucideIcons.user, size: 18)),
                        items: _customers.map((c) => DropdownMenuItem(
                          value: c,
                          child: Text(c['name'] ?? '', style: GoogleFonts.cairo()),
                        )).toList(),
                        onChanged: (v) {
                          setState(() { _selectedCustomer = v; _selectedInvoice = null; _unpaidInvoices = []; });
                          _loadUnpaidInvoices();
                        },
                      ),
                      const SizedBox(height: 12),
                      // Unpaid invoices
                      if (_unpaidInvoices.isNotEmpty)
                        DropdownButtonFormField<Map<String, dynamic>>(
                          value: _selectedInvoice,
                          decoration: const InputDecoration(labelText: 'فاتورة (اختياري)', prefixIcon: Icon(LucideIcons.fileText, size: 18)),
                          items: [
                            DropdownMenuItem(value: null, child: Text('بدون فاتورة محددة', style: GoogleFonts.cairo())),
                            ..._unpaidInvoices.map((inv) => DropdownMenuItem(
                              value: inv,
                              child: Text('${inv['invoice_number'] ?? inv['invoiceNumber']} - ${_fmt.format((inv['remaining_amount'] ?? inv['remainingAmount'] ?? 0))} ج', style: GoogleFonts.cairo(fontSize: 13)),
                            )),
                          ],
                          onChanged: (v) {
                            setState(() {
                              _selectedInvoice = v;
                              if (v != null) {
                                final rem = v['remaining_amount'] ?? v['remainingAmount'];
                                if (rem != null) _amountController.text = rem.toString();
                              }
                            });
                          },
                        ),
                      if (_unpaidInvoices.isNotEmpty) const SizedBox(height: 12),
                      // Amount
                      TextField(
                        controller: _amountController,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        decoration: const InputDecoration(labelText: 'المبلغ *', prefixIcon: Icon(LucideIcons.banknote, size: 18), suffix: Text('جنيه')),
                      ),
                      const SizedBox(height: 12),
                      // Payment method
                      if (_paymentMethods.isNotEmpty)
                        DropdownButtonFormField<Map<String, dynamic>>(
                          value: _selectedPaymentMethod,
                          decoration: const InputDecoration(labelText: 'طريقة الدفع', prefixIcon: Icon(LucideIcons.creditCard, size: 18)),
                          items: _paymentMethods.map((m) => DropdownMenuItem(
                            value: m,
                            child: Text(m['name'] ?? '', style: GoogleFonts.cairo()),
                          )).toList(),
                          onChanged: (v) => setState(() => _selectedPaymentMethod = v),
                        ),
                      const SizedBox(height: 12),
                      // Reference
                      TextField(
                        controller: _referenceController,
                        decoration: const InputDecoration(labelText: 'رقم مرجعي', prefixIcon: Icon(LucideIcons.hash, size: 18)),
                      ),
                      const SizedBox(height: 12),
                      // Date
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(LucideIcons.calendar, color: AppColors.primary),
                        title: Text('تاريخ القبض', style: GoogleFonts.cairo(color: AppColors.textSecondary, fontSize: 13)),
                        subtitle: Text(DateFormat('yyyy/MM/dd').format(_paymentDate), style: GoogleFonts.cairo(fontWeight: FontWeight.w600)),
                        onTap: () async {
                          final d = await showDatePicker(context: context, initialDate: _paymentDate, firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1)));
                          if (d != null) setState(() => _paymentDate = d);
                        },
                      ),
                      const SizedBox(height: 8),
                      // Notes
                      TextField(
                        controller: _notesController,
                        decoration: const InputDecoration(labelText: 'ملاحظات', prefixIcon: Icon(LucideIcons.fileText, size: 18)),
                        maxLines: 2,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildCard({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 2))],
      ),
      child: child,
    );
  }
}
