import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../config/theme.dart';

class _CartItem {
  final String productId;
  final String name;
  final double price;
  double quantity;
  double discount;
  final String? unitName;

  _CartItem({
    required this.productId,
    required this.name,
    required this.price,
    this.quantity = 1,
    this.discount = 0,
    this.unitName,
  });

  double get total => (price * quantity) - discount;
}

class CreateInvoiceScreen extends StatefulWidget {
  const CreateInvoiceScreen({super.key});

  @override
  State<CreateInvoiceScreen> createState() => _CreateInvoiceScreenState();
}

class _CreateInvoiceScreenState extends State<CreateInvoiceScreen> {
  final _notesController = TextEditingController();
  final _searchController = TextEditingController();
  final _invoiceDiscountController = TextEditingController(text: '0');

  bool _isLoading = false;
  bool _isSaving = false;

  List<Map<String, dynamic>> _allProducts = [];
  List<Map<String, dynamic>> _filteredProducts = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _paymentMethods = [];
  List<_CartItem> _cart = [];

  Map<String, dynamic>? _selectedCustomer;
  Map<String, dynamic>? _selectedPaymentMethod;
  String _paymentType = 'cash';
  DateTime _invoiceDate = DateTime.now();

  final _fmt = NumberFormat('#,##0.##', 'ar');

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchController.addListener(_filterProducts);
  }

  @override
  void dispose() {
    _notesController.dispose();
    _searchController.dispose();
    _invoiceDiscountController.dispose();
    super.dispose();
  }

  void _filterProducts() {
    final q = _searchController.text.toLowerCase();
    setState(() {
      _filteredProducts = q.isEmpty
          ? _allProducts
          : _allProducts.where((p) =>
              (p['name'] as String? ?? '').toLowerCase().contains(q) ||
              (p['barcode'] as String? ?? '').contains(q)).toList();
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final products = await api.getProducts(limit: 500);
      final customersRes = await api.getCustomers();
      final paymentMethods = await api.getPaymentMethods();
      setState(() {
        _allProducts = products;
        _filteredProducts = products;
        final cd = customersRes['data'] as List? ?? [];
        _customers = cd.cast<Map<String, dynamic>>();
        _paymentMethods = paymentMethods;
        if (_paymentMethods.isNotEmpty) _selectedPaymentMethod = _paymentMethods.first;
      });
    } catch (e) {
      _showSnack('فشل تحميل البيانات: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _addToCart(Map<String, dynamic> product) {
    final id = product['id'].toString();
    final existing = _cart.indexWhere((c) => c.productId == id);
    setState(() {
      if (existing >= 0) {
        _cart[existing].quantity += 1;
      } else {
        _cart.add(_CartItem(
          productId: id,
          name: product['name'] ?? '',
          price: double.tryParse(product['sale_price'].toString()) ?? 0,
          unitName: product['unit_name'],
        ));
      }
    });
  }

  void _removeFromCart(int index) => setState(() => _cart.removeAt(index));

  double get _subtotal => _cart.fold(0, (s, i) => s + i.total);
  double get _invoiceDiscount => double.tryParse(_invoiceDiscountController.text) ?? 0;
  double get _netTotal => _subtotal - _invoiceDiscount;

  String _generateInvoiceNumber() {
    final now = DateTime.now();
    return 'INV-${now.year}${now.month.toString().padLeft(2,'0')}${now.day.toString().padLeft(2,'0')}-${now.millisecondsSinceEpoch % 10000}';
  }

  Future<void> _save() async {
    if (_cart.isEmpty) { _showSnack('أضف منتجاً على الأقل', isError: true); return; }
    setState(() => _isSaving = true);
    try {
      final api = ApiService();
      final paidAmount = _paymentType == 'cash' ? _netTotal : 0.0;
      await api.createInvoice({
        'invoice_number': _generateInvoiceNumber(),
        'invoice_date': _invoiceDate.toIso8601String(),
        'customer_id': _selectedCustomer?['id'],
        'customer_name': _selectedCustomer?['name'],
        'subtotal': _subtotal,
        'discount': _invoiceDiscount,
        'net_total': _netTotal,
        'total': _netTotal,
        'paid_amount': paidAmount,
        'remaining_amount': _netTotal - paidAmount,
        'payment_status': paidAmount >= _netTotal ? 'paid' : (_paymentType == 'cash' ? 'partial' : 'unpaid'),
        'payment_type': _paymentType,
        'payment_method_id': _selectedPaymentMethod?['id'],
        'payment_method_name': _selectedPaymentMethod?['name'],
        'notes': _notesController.text.trim(),
        'items': _cart.map((c) => {
          'product_id': c.productId,
          'name': c.name,
          'quantity': c.quantity,
          'unit_price': c.price,
          'price': c.price,
          'discount': c.discount,
          'total': c.total,
          'unit_name': c.unitName,
        }).toList(),
      });
      _showSnack('تم إنشاء الفاتورة بنجاح');
      if (mounted) context.pop();
    } catch (e) {
      _showSnack('فشل إنشاء الفاتورة: $e', isError: true);
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
        title: const Text('فاتورة بيع جديدة'),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowRight),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: _isSaving || _cart.isEmpty ? null : _save,
            child: _isSaving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text('حفظ', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildInfoCard(),
                      const SizedBox(height: 12),
                      _buildProductSearch(),
                      const SizedBox(height: 12),
                      if (_cart.isNotEmpty) _buildCart(),
                      if (_cart.isNotEmpty) const SizedBox(height: 12),
                      if (_cart.isNotEmpty) _buildTotals(),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildInfoCard() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('معلومات الفاتورة', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          // Customer
          DropdownButtonFormField<Map<String, dynamic>>(
            value: _selectedCustomer,
            decoration: InputDecoration(labelText: 'العميل (اختياري)', prefixIcon: const Icon(LucideIcons.user, size: 18)),
            items: _customers.map((c) => DropdownMenuItem(
              value: c,
              child: Text(c['name'] ?? '', style: GoogleFonts.cairo()),
            )).toList(),
            onChanged: (v) => setState(() => _selectedCustomer = v),
          ),
          const SizedBox(height: 12),
          // Payment type
          Row(
            children: [
              Expanded(child: _TypeChip(label: 'نقدي', icon: LucideIcons.banknote, selected: _paymentType == 'cash', onTap: () => setState(() => _paymentType = 'cash'))),
              const SizedBox(width: 8),
              Expanded(child: _TypeChip(label: 'آجل', icon: LucideIcons.clock, selected: _paymentType == 'credit', onTap: () => setState(() => _paymentType = 'credit'))),
            ],
          ),
          const SizedBox(height: 12),
          // Payment method
          if (_paymentMethods.isNotEmpty)
            DropdownButtonFormField<Map<String, dynamic>>(
              value: _selectedPaymentMethod,
              decoration: InputDecoration(labelText: 'طريقة الدفع', prefixIcon: const Icon(LucideIcons.creditCard, size: 18)),
              items: _paymentMethods.map((m) => DropdownMenuItem(
                value: m,
                child: Text(m['name'] ?? '', style: GoogleFonts.cairo()),
              )).toList(),
              onChanged: (v) => setState(() => _selectedPaymentMethod = v),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(labelText: 'ملاحظات', prefixIcon: Icon(LucideIcons.fileText, size: 18)),
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  Widget _buildProductSearch() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('إضافة منتجات', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
          const SizedBox(height: 10),
          TextField(
            controller: _searchController,
            decoration: const InputDecoration(
              hintText: 'بحث باسم المنتج أو الباركود...',
              prefixIcon: Icon(LucideIcons.search, size: 18),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 200,
            child: _filteredProducts.isEmpty
                ? Center(child: Text('لا توجد منتجات', style: GoogleFonts.cairo(color: AppColors.textMuted)))
                : ListView.separated(
                    itemCount: _filteredProducts.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final p = _filteredProducts[i];
                      final price = double.tryParse(p['sale_price'].toString()) ?? 0;
                      return ListTile(
                        dense: true,
                        title: Text(p['name'] ?? '', style: GoogleFonts.cairo(fontSize: 14, fontWeight: FontWeight.w600)),
                        subtitle: Text('${_fmt.format(price)} جنيه', style: GoogleFonts.cairo(fontSize: 12, color: AppColors.textSecondary)),
                        trailing: IconButton(
                          icon: const Icon(LucideIcons.plusCircle, color: AppColors.primary),
                          onPressed: () => _addToCart(p),
                        ),
                        onTap: () => _addToCart(p),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildCart() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('الأصناف المضافة', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          ..._cart.asMap().entries.map((e) {
            final i = e.key;
            final item = e.value;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(item.name, style: GoogleFonts.cairo(fontWeight: FontWeight.w600, fontSize: 14))),
                      IconButton(icon: const Icon(LucideIcons.trash2, size: 18, color: AppColors.error), onPressed: () => _removeFromCart(i), padding: EdgeInsets.zero, constraints: const BoxConstraints()),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _QtyButton(icon: LucideIcons.minus, onTap: () => setState(() { if (item.quantity > 1) item.quantity -= 1; else _removeFromCart(i); })),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 50,
                        child: TextFormField(
                          initialValue: item.quantity.toString(),
                          textAlign: TextAlign.center,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                          style: GoogleFonts.cairo(fontWeight: FontWeight.w700),
                          decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(vertical: 4, horizontal: 4), isDense: true),
                          onChanged: (v) => setState(() => item.quantity = double.tryParse(v) ?? 1),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _QtyButton(icon: LucideIcons.plus, onTap: () => setState(() => item.quantity += 1)),
                      const Spacer(),
                      Text('${_fmt.format(item.total)} جنيه', style: GoogleFonts.cairo(fontWeight: FontWeight.w700, color: AppColors.primary)),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildTotals() {
    return _Card(
      child: Column(
        children: [
          _TotalRow(label: 'الإجمالي', value: '${_fmt.format(_subtotal)} جنيه'),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('خصم الفاتورة', style: GoogleFonts.cairo(color: AppColors.textSecondary)),
              const SizedBox(width: 12),
              SizedBox(
                width: 90,
                child: TextField(
                  controller: _invoiceDiscountController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(vertical: 8, horizontal: 10), suffix: Text('ج')),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ],
          ),
          const Divider(height: 20),
          _TotalRow(label: 'الصافي', value: '${_fmt.format(_netTotal)} جنيه', isBold: true, color: AppColors.primary),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});
  @override
  Widget build(BuildContext context) {
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

class _TypeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _TypeChip({required this.label, required this.icon, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: selected ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(label, style: GoogleFonts.cairo(color: selected ? Colors.white : AppColors.textSecondary, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _QtyButton({required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.border)),
        child: Icon(icon, size: 16, color: AppColors.primary),
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? color;
  const _TotalRow({required this.label, required this.value, this.isBold = false, this.color});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.cairo(color: AppColors.textSecondary, fontSize: 14)),
        Text(value, style: GoogleFonts.cairo(fontWeight: isBold ? FontWeight.w700 : FontWeight.w600, fontSize: isBold ? 16 : 14, color: color ?? AppColors.textPrimary)),
      ],
    );
  }
}
