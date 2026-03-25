import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../config/theme.dart';

class CreatePaymentScreen extends StatefulWidget {
  /// If provided, pre-selects the customer and optionally the invoice
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

  final _currencyFormat = NumberFormat('#,##0.00', 'ar');

  @override
  void initState() {
    super.initState();
    _loadData();
    if (widget.customer != null) _selectedCustomer = widget.customer;
    if (widget.invoice != null) {
      _selectedInvoice = widget.invoice;
      final remaining = widget.invoice!['remaining_amount'] ?? widget.invoice!['remainingAmount'];
      if (remaining != null) _amountController.text = remaining.toString();
    }
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
      final results = await Future.wait([
        api.getCustomers(),
        api.getPaymentMethods(),
      ]);
      setState(() {
        final customersData = results[0]['data'] as List? ?? [];
        _customers = customersData.cast<Map<String, dynamic>>();
        _paymentMethods = results[1];
        if (_paymentMethods.isNotEmpty) _selectedPaymentMethod = _paymentMethods.first;
        if (widget.customer != null) {
          _selectedCustomer = _customers.firstWhere(
            (c) => c['id'].toString() == widget.customer!['id'].toString(),
            orElse: () => widget.customer!,
          );
        }
      });
      if (_selectedCustomer != null) await _loadUnpaidInvoices();
    } catch (e) {
      _showError('فشل تحميل البيانات: $e');
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
      setState(() {
        _unpaidInvoices = (res['data'] as List? ?? []).cast<Map<String, dynamic>>();
      });
    } catch (_) {}
  }

  Future<void> _savePayment() async {
    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) { _showError('أدخل مبلغاً صحيحاً'); return; }
    if (_selectedCustomer == null) { _showError('اختر العميل'); return; }
    if (_selectedPaymentMethod == null) { _showError('اختر طريقة الدفع'); return; }

    setState(() => _isSaving = true);
    try {
      final api = ApiService();
      final data = {
        'customerId': _selectedCustomer!['id'].toString(),
        'customerName': _selectedCustomer!['name'],
        'amount': amount,
        'paymentMethodId': _selectedPaymentMethod!['id'].toString(),
        'paymentMethodName': _selectedPaymentMethod!['name'],
        'paymentDate': _paymentDate.toIso8601String(),
        'referenceNumber': _referenceController.text.trim(),
        'notes': _notesController.text.trim(),
        if (_selectedInvoice != null) 'invoiceId': _selectedInvoice!['id'].toString(),
        'paymentType': 'receipt',
      };
      await api.createPayment(data);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم تسجيل القبض بنجاح'), backgroundColor: Colors.green),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _showError('فشل تسجيل القبض: $e');
    } finally {
      setState(() => _isSaving = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('إضافة قبض'),
        actions: [
          if (_isSaving)
            const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
          else
            TextButton.icon(
              onPressed: _savePayment,
              icon: const Icon(LucideIcons.save, size: 18),
              label: const Text('حفظ'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Customer
                  DropdownButtonFormField<Map<String, dynamic>>(
                    decoration: const InputDecoration(labelText: 'العميل *', border: OutlineInputBorder()),
                    value: _selectedCustomer,
                    items: _customers.map((c) => DropdownMenuItem(
                      value: c,
                      child: Text(c['name']?.toString() ?? ''),
                    )).toList(),
                    onChanged: (v) {
                      setState(() { _selectedCustomer = v; _selectedInvoice = null; });
                      _loadUnpaidInvoices();
                    },
                  ),
                  const SizedBox(height: 12),
                  // Invoice (optional)
                  if (_unpaidInvoices.isNotEmpty) ...[
                    DropdownButtonFormField<Map<String, dynamic>>(
                      decoration: const InputDecoration(labelText: 'فاتورة (اختياري)', border: OutlineInputBorder()),
                      value: _selectedInvoice,
                      items: [
                        const DropdownMenuItem(value: null, child: Text('بدون فاتورة محددة')),
                        ..._unpaidInvoices.map((inv) => DropdownMenuItem(
                          value: inv,
                          child: Text('${inv['invoice_number'] ?? inv['invoiceNumber']} - ${_currencyFormat.format(double.tryParse((inv['remaining_amount'] ?? inv['remainingAmount'] ?? 0).toString()) ?? 0)} متبقي'),
                        )),
                      ],
                      onChanged: (v) {
                        setState(() {
                          _selectedInvoice = v;
                          if (v != null) {
                            final rem = v['remaining_amount'] ?? v['remainingAmount'] ?? 0;
                            _amountController.text = rem.toString();
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                  ],
                  // Amount
                  TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'المبلغ *', border: OutlineInputBorder(), suffixText: 'ج.م'),
                  ),
                  const SizedBox(height: 12),
                  // Payment method
                  DropdownButtonFormField<Map<String, dynamic>>(
                    decoration: const InputDecoration(labelText: 'طريقة الدفع *', border: OutlineInputBorder()),
                    value: _selectedPaymentMethod,
                    items: _paymentMethods.map((m) => DropdownMenuItem(
                      value: m,
                      child: Text(m['name']?.toString() ?? ''),
                    )).toList(),
                    onChanged: (v) => setState(() => _selectedPaymentMethod = v),
                  ),
                  const SizedBox(height: 12),
                  // Date
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(LucideIcons.calendar),
                    title: Text('تاريخ القبض: ${DateFormat('dd/MM/yyyy').format(_paymentDate)}'),
                    onTap: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _paymentDate,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2030),
                      );
                      if (d != null) setState(() => _paymentDate = d);
                    },
                  ),
                  const SizedBox(height: 12),
                  // Reference
                  TextField(
                    controller: _referenceController,
                    decoration: const InputDecoration(labelText: 'رقم المرجع (اختياري)', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  // Notes
                  TextField(
                    controller: _notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'ملاحظات', border: OutlineInputBorder()),
                  ),
                ],
              ),
            ),
    );
  }
}
