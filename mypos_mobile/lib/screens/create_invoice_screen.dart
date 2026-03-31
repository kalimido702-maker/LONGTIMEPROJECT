import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import 'dart:ui' as ui;
import '../services/api_service.dart';
import '../config/theme.dart';

class _CartItem {
  final String productId;
  final String name;
  double price;
  double quantity;
  double discount;
  final String? unitName;
  final String? warehouseId;
  final String? warehouseName;

  final TextEditingController qtyController;
  final TextEditingController discountController;
  final TextEditingController priceController;

  _CartItem({
    required this.productId,
    required this.name,
    required this.price,
    double quantity = 1,
    double discount = 0,
    this.unitName,
    this.warehouseId,
    this.warehouseName,
  })  : quantity = quantity,
        discount = discount,
        qtyController = TextEditingController(text: quantity.toString()),
        discountController = TextEditingController(text: discount.toString()),
        priceController = TextEditingController(text: price.toString());

  double get total => (price * quantity) - discount;

  void dispose() {
    qtyController.dispose();
    discountController.dispose();
    priceController.dispose();
  }
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
  final _paidAmountController = TextEditingController();

  bool _isLoading = false;
  bool _isSaving = false;

  List<Map<String, dynamic>> _allProducts = [];
  List<Map<String, dynamic>> _filteredProducts = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _paymentMethods = [];
  List<Map<String, dynamic>> _warehouses = [];
  List<_CartItem> _cart = [];

  Map<String, dynamic>? _selectedCustomer;
  Map<String, dynamic>? _selectedPaymentMethod;
  String _paymentType = 'cash';
  bool _isPartial = false;
  DateTime _invoiceDate = DateTime.now();

  // Quantity + warehouse dialog state
  Map<String, dynamic>? _pendingProduct;
  double _pendingQty = 1;
  List<Map<String, dynamic>> _pendingStocks = [];
  Map<String, dynamic>? _pendingWarehouse;
  bool _showQtyDialog = false;
  bool _loadingStock = false; // ignore: unused_field

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
    _paidAmountController.dispose();
    for (final item in _cart) {
      item.dispose();
    }
    super.dispose();
  }

  void _filterProducts() {
    final q = _searchController.text.toLowerCase();
    setState(() {
      _filteredProducts = q.isEmpty
          ? _allProducts
          : _allProducts
              .where((p) =>
                  (p['name'] as String? ?? '').toLowerCase().contains(q) ||
                  (p['barcode'] as String? ?? '').contains(q))
              .toList();
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final results = await Future.wait([
        api.getProducts(limit: 500),
        api.getCustomers(),
        api.getPaymentMethods(),
        api.getWarehouses(),
      ]);
      final productsRes = results[0] as Map<String, dynamic>;
      final customersRes = results[1] as Map<String, dynamic>;
      final paymentMethods = results[2] as List<Map<String, dynamic>>;
      final warehouses = results[3] as List<Map<String, dynamic>>;
      final rawProducts = (productsRes['data'] as List? ?? []).cast<Map<String, dynamic>>();
      setState(() {
        _allProducts = rawProducts;
        _filteredProducts = rawProducts;
        final cd = customersRes['data'] as List? ?? [];
        _customers = cd.cast<Map<String, dynamic>>();
        _paymentMethods = paymentMethods;
        _warehouses = warehouses;
        if (_paymentMethods.isNotEmpty) _selectedPaymentMethod = _paymentMethods.first;
      });
    } catch (e) {
      _showSnack('فشل تحميل البيانات: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _addToCart(Map<String, dynamic> product) async {
    // Fetch per-warehouse stock
    List<Map<String, dynamic>> stocks = [];
    try {
      stocks = await ApiService().getProductStock(product['id'].toString());
    } catch (_) {}

    // Auto-select: default warehouse that has stock, or first warehouse
    Map<String, dynamic>? defaultWarehouse;
    if (stocks.isNotEmpty) {
      defaultWarehouse = stocks.firstWhere(
        (s) => s['is_default'] == 1 || s['is_default'] == true,
        orElse: () => stocks.first,
      );
    } else if (_warehouses.isNotEmpty) {
      defaultWarehouse = _warehouses.firstWhere(
        (w) => w['is_default'] == 1 || w['is_default'] == true,
        orElse: () => _warehouses.first,
      );
    }

    setState(() {
      _pendingProduct = product;
      _pendingQty = 1;
      _pendingStocks = stocks;
      _pendingWarehouse = defaultWarehouse;
      _showQtyDialog = true;
    });
  }

  void _confirmAddToCart() {
    if (_pendingProduct == null || _pendingQty <= 0) return;
    final product = _pendingProduct!;
    final id = product['id'].toString();
    final existing = _cart.indexWhere((c) => c.productId == id);
    final price = double.tryParse(
            (product['effective_price'] ?? product['selling_price'] ?? 0).toString()) ??
        0;
    setState(() {
      if (existing >= 0) {
        final item = _cart[existing];
        item.quantity += _pendingQty;
        item.qtyController.text = item.quantity.toString();
      } else {
        _cart.add(_CartItem(
          productId: id,
          name: product['name'] ?? '',
          price: price,
          quantity: _pendingQty,
          unitName: product['unit_name'],
          warehouseId: _pendingWarehouse?['warehouse_id'] as String?,
          warehouseName: (_pendingWarehouse?['warehouse_name'] ?? _pendingWarehouse?['name']) as String?,
        ));
      }
      _pendingProduct = null;
      _showQtyDialog = false;
    });
  }

  void _removeFromCart(int index) {
    setState(() {
      _cart[index].dispose();
      _cart.removeAt(index);
    });
  }

  double get _subtotal => _cart.fold(0, (s, i) => s + i.total);
  double get _invoiceDiscount =>
      double.tryParse(_invoiceDiscountController.text) ?? 0;
  double get _netTotal => _subtotal - _invoiceDiscount;

  double get _paidAmount {
    if (_paymentType == 'credit') return 0;
    if (!_isPartial) return _netTotal;
    return double.tryParse(_paidAmountController.text) ?? 0;
  }

  Future<void> _save() async {
    if (_cart.isEmpty) {
      _showSnack('أضف منتجاً على الأقل', isError: true);
      return;
    }
    if (_paymentType == 'credit' && _selectedCustomer == null) {
      _showSnack('اختر العميل للبيع الآجل', isError: true);
      return;
    }
    setState(() => _isSaving = true);
    try {
      final api = ApiService();
      final paid = _paidAmount;
      final methodId = _paymentType == 'cash' ? (_selectedPaymentMethod != null ? _selectedPaymentMethod!['id'] : null) : null;
      await api.createInvoice({
        'invoiceDate': _invoiceDate.toIso8601String(),
        'customerId': _selectedCustomer != null ? _selectedCustomer!['id'] : null,
        'discount': _invoiceDiscount,
        'paidAmount': paid,
        'paymentType': _paymentType,
        'paymentMethodId': methodId,
        'notes': _notesController.text.trim(),
        'items': _cart
            .map((c) => {
                  'productId': c.productId,
                  'name': c.name,
                  'quantity': c.quantity,
                  'price': c.price,
                  'discount': c.discount,
                  'unitName': c.unitName,
                  if (c.warehouseId != null) 'warehouseId': c.warehouseId,
                })
            .toList(),
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
    return Stack(
      children: [
        Scaffold(
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
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : Text('حفظ',
                    style: GoogleFonts.cairo(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 16)),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
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
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ],
            ),
        ),
        // ── Quantity + Warehouse dialog overlay ──
        if (_showQtyDialog && _pendingProduct != null)
          _buildQtyDialog(),
      ],
    );
  }

  Widget _buildQtyDialog() {
    final product = _pendingProduct!;
    final price = double.tryParse(
            (product['effective_price'] ?? product['selling_price'] ?? 0).toString()) ??
        0;
    final total = price * _pendingQty;

    return GestureDetector(
      onTap: () => setState(() { _showQtyDialog = false; _pendingProduct = null; }),
      child: Container(
        color: Colors.black54,
        child: Center(
          child: GestureDetector(
            onTap: () {},
            child: Material(
              color: Colors.transparent,
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 24),
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.85,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Directionality(
                  textDirection: ui.TextDirection.rtl,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header
                      Text('أدخل الكمية',
                          style: GoogleFonts.cairo(
                              fontWeight: FontWeight.w700,
                              fontSize: 18,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      // Product info card
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(product['name'] ?? '',
                                style: GoogleFonts.cairo(
                                    fontWeight: FontWeight.w700, fontSize: 15)),
                            const SizedBox(height: 4),
                            Text('السعر: ${_fmt.format(price)} جنيه',
                                style: GoogleFonts.cairo(
                                    fontSize: 13,
                                    color: AppColors.textSecondary)),
                            if (product['units_per_carton'] != null &&
                                product['units_per_carton'] != 0)
                              Text(
                                  'العدد في الكرتونة: ${product['units_per_carton']}',
                                  style: GoogleFonts.cairo(
                                      fontSize: 13,
                                      color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Quantity stepper
                      Text('الكمية',
                          style: GoogleFonts.cairo(
                              fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _QtyDialogBtn(
                            icon: LucideIcons.minus,
                            onTap: _pendingQty > 1
                                ? () => setState(() => _pendingQty--)
                                : null,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextFormField(
                              initialValue: _pendingQty.toStringAsFixed(
                                  _pendingQty % 1 == 0 ? 0 : 2),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              inputFormatters: [
                                FilteringTextInputFormatter.allow(
                                    RegExp(r'[0-9.]'))
                              ],
                              textAlign: TextAlign.center,
                              style: GoogleFonts.cairo(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700),
                              decoration: InputDecoration(
                                border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10)),
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    vertical: 10, horizontal: 8),
                              ),
                              onChanged: (v) {
                                final val = double.tryParse(v) ?? 1;
                                setState(() => _pendingQty = val > 0 ? val : 1);
                              },
                            ),
                          ),
                          const SizedBox(width: 8),
                          _QtyDialogBtn(
                            icon: LucideIcons.plus,
                            onTap: () => setState(() => _pendingQty++),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Warehouse selection
                      if (_pendingStocks.isNotEmpty) ...[
                        Text('المخزن',
                            style: GoogleFonts.cairo(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<Map<String, dynamic>>(
                          value: _pendingWarehouse,
                          decoration: InputDecoration(
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10)),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                                vertical: 10, horizontal: 12),
                            prefixIcon: const Icon(LucideIcons.warehouse,
                                size: 18),
                          ),
                          items: _pendingStocks
                              .map((s) => DropdownMenuItem(
                                    value: s,
                                    child: Text(
                                      '${s['warehouse_name']} — ${_fmt.format(double.tryParse(s['quantity'].toString()) ?? 0)} متاح',
                                      style: GoogleFonts.cairo(fontSize: 13),
                                    ),
                                  ))
                              .toList(),
                          onChanged: (v) =>
                              setState(() => _pendingWarehouse = v),
                        ),
                        const SizedBox(height: 16),
                      ],
                      // Total
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('الإجمالي',
                                style: GoogleFonts.cairo(
                                    fontWeight: FontWeight.w600)),
                            Text('${_fmt.format(total)} جنيه',
                                style: GoogleFonts.cairo(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                    fontSize: 16)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Buttons
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => setState(() {
                                _showQtyDialog = false;
                                _pendingProduct = null;
                              }),
                              style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(
                                      vertical: 14)),
                              child: Text('إلغاء',
                                  style: GoogleFonts.cairo(
                                      fontWeight: FontWeight.w600)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _pendingQty > 0
                                  ? _confirmAddToCart
                                  : null,
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  padding: const EdgeInsets.symmetric(
                                      vertical: 14)),
                              child: Text('إضافة للسلة',
                                  style: GoogleFonts.cairo(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ],
                      ),
                    ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInfoCard() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('معلومات الفاتورة',
              style: GoogleFonts.cairo(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          DropdownButtonFormField<Map<String, dynamic>>(
            value: _selectedCustomer,
            decoration: InputDecoration(
                labelText: 'العميل (اختياري)',
                prefixIcon: const Icon(LucideIcons.user, size: 18)),
            items: _customers
                .map((c) => DropdownMenuItem(
                    value: c,
                    child: Text(c['name'] ?? '', style: GoogleFonts.cairo())))
                .toList(),
            onChanged: (v) => setState(() => _selectedCustomer = v),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                  child: _TypeChip(
                      label: 'نقدي',
                      icon: LucideIcons.banknote,
                      selected: _paymentType == 'cash',
                      onTap: () => setState(() {
                            _paymentType = 'cash';
                            _isPartial = false;
                          }))),
              const SizedBox(width: 8),
              Expanded(
                  child: _TypeChip(
                      label: 'آجل',
                      icon: LucideIcons.clock,
                      selected: _paymentType == 'credit',
                      onTap: () => setState(() {
                            _paymentType = 'credit';
                            _isPartial = false;
                          }))),
            ],
          ),
          if (_paymentType == 'cash') ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Checkbox(
                  value: _isPartial,
                  activeColor: AppColors.primary,
                  onChanged: (v) => setState(() {
                    _isPartial = v ?? false;
                    if (_isPartial) {
                      _paidAmountController.text = _netTotal.toStringAsFixed(2);
                    }
                  }),
                ),
                Text('دفع جزئي',
                    style: GoogleFonts.cairo(
                        color: AppColors.textSecondary, fontSize: 14)),
              ],
            ),
            if (_isPartial)
              TextField(
                controller: _paidAmountController,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))
                ],
                decoration: InputDecoration(
                  labelText: 'المبلغ المدفوع',
                  prefixIcon: const Icon(LucideIcons.wallet, size: 18),
                  suffix: const Text('جنيه'),
                ),
                onChanged: (_) => setState(() {}),
              ),
          ],
          const SizedBox(height: 12),
          if (_paymentType == 'cash' && _paymentMethods.isNotEmpty)
            DropdownButtonFormField<Map<String, dynamic>>(
              value: _selectedPaymentMethod,
              decoration: InputDecoration(
                  labelText: 'طريقة الدفع',
                  prefixIcon: const Icon(LucideIcons.creditCard, size: 18)),
              items: _paymentMethods
                  .map((m) => DropdownMenuItem(
                      value: m,
                      child:
                          Text(m['name'] ?? '', style: GoogleFonts.cairo())))
                  .toList(),
              onChanged: (v) => setState(() => _selectedPaymentMethod = v),
            ),
          const SizedBox(height: 12),
          InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _invoiceDate,
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (picked != null) setState(() => _invoiceDate = picked);
            },
            child: InputDecorator(
              decoration: const InputDecoration(
                  prefixIcon: Icon(LucideIcons.calendar, size: 18),
                  labelText: 'تاريخ الفاتورة'),
              child: Text(
                '${_invoiceDate.year}/${_invoiceDate.month.toString().padLeft(2, '0')}/${_invoiceDate.day.toString().padLeft(2, '0')}',
                style: GoogleFonts.cairo(fontSize: 14),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
                labelText: 'ملاحظات',
                prefixIcon: Icon(LucideIcons.fileText, size: 18)),
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
          Text('إضافة منتجات',
              style: GoogleFonts.cairo(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                  color: AppColors.textPrimary)),
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
                ? Center(
                    child: Text('لا توجد منتجات',
                        style:
                            GoogleFonts.cairo(color: AppColors.textMuted)))
                : ListView.separated(
                    itemCount: _filteredProducts.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final p = _filteredProducts[i];
                      final price = double.tryParse(
                              (p['effective_price'] ?? p['selling_price'] ?? 0).toString()) ??
                          0;
                      final inCart =
                          _cart.any((c) => c.productId == p['id'].toString());
                      return ListTile(
                        dense: true,
                        title: Text(p['name'] ?? '',
                            style: GoogleFonts.cairo(
                                fontSize: 14,
                                fontWeight: FontWeight.w600)),
                        subtitle: Text('${_fmt.format(price)} جنيه',
                            style: GoogleFonts.cairo(
                                fontSize: 12,
                                color: AppColors.textSecondary)),
                        trailing: IconButton(
                          icon: Icon(LucideIcons.plusCircle,
                              color: inCart
                                  ? AppColors.success
                                  : AppColors.primary),
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
          Text('الأصناف المضافة',
              style: GoogleFonts.cairo(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          ..._cart.asMap().entries.map((e) {
            final i = e.key;
            final item = e.value;
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                          child: Text(item.name,
                              style: GoogleFonts.cairo(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14))),
                      IconButton(
                          icon: const Icon(LucideIcons.trash2,
                              size: 18, color: AppColors.error),
                          onPressed: () => _removeFromCart(i),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints()),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text('الكمية:',
                          style: GoogleFonts.cairo(
                              fontSize: 12,
                              color: AppColors.textSecondary)),
                      const SizedBox(width: 8),
                      _QtyButton(
                          icon: LucideIcons.minus,
                          onTap: () => setState(() {
                                if (item.quantity > 1) {
                                  item.quantity -= 1;
                                } else {
                                  _removeFromCart(i);
                                  return;
                                }
                                item.qtyController.text =
                                    item.quantity.toString();
                              })),
                      const SizedBox(width: 6),
                      SizedBox(
                        width: 54,
                        child: TextField(
                          controller: item.qtyController,
                          textAlign: TextAlign.center,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9.]'))
                          ],
                          style: GoogleFonts.cairo(
                              fontWeight: FontWeight.w700),
                          decoration: const InputDecoration(
                              contentPadding: EdgeInsets.symmetric(
                                  vertical: 4, horizontal: 4),
                              isDense: true),
                          onChanged: (v) => setState(() =>
                              item.quantity = double.tryParse(v) ?? 1),
                        ),
                      ),
                      const SizedBox(width: 6),
                      _QtyButton(
                          icon: LucideIcons.plus,
                          onTap: () => setState(() {
                                item.quantity += 1;
                                item.qtyController.text =
                                    item.quantity.toString();
                              })),
                      if (item.unitName != null) ...[
                        const SizedBox(width: 8),
                        Text(item.unitName!,
                            style: GoogleFonts.cairo(
                                fontSize: 11,
                                color: AppColors.textMuted)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: item.priceController,
                          keyboardType:
                              const TextInputType.numberWithOptions(
                                  decimal: true),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9.]'))
                          ],
                          style: GoogleFonts.cairo(fontSize: 13),
                          decoration: InputDecoration(
                            labelText: 'السعر',
                            labelStyle: GoogleFonts.cairo(fontSize: 11),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                                vertical: 8, horizontal: 10),
                            suffix: Text('جنيه',
                                style: GoogleFonts.cairo(fontSize: 11)),
                          ),
                          onChanged: (v) => setState(() =>
                              item.price = double.tryParse(v) ?? item.price),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: item.discountController,
                          keyboardType:
                              const TextInputType.numberWithOptions(
                                  decimal: true),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9.]'))
                          ],
                          style: GoogleFonts.cairo(fontSize: 13),
                          decoration: InputDecoration(
                            labelText: 'خصم الصنف',
                            labelStyle: GoogleFonts.cairo(fontSize: 11),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                                vertical: 8, horizontal: 10),
                            suffix: Text('جنيه',
                                style: GoogleFonts.cairo(fontSize: 11)),
                          ),
                          onChanged: (v) => setState(
                              () => item.discount = double.tryParse(v) ?? 0),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'إجمالي الصنف: ${_fmt.format(item.total)} جنيه',
                      style: GoogleFonts.cairo(
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                          fontSize: 13),
                    ),
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
    final remaining = _netTotal - _paidAmount;
    return _Card(
      child: Column(
        children: [
          _TotalRow(
              label: 'الإجمالي قبل الخصم',
              value: '${_fmt.format(_subtotal)} جنيه'),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('خصم الفاتورة',
                  style: GoogleFonts.cairo(
                      color: AppColors.textSecondary)),
              const SizedBox(width: 12),
              SizedBox(
                width: 90,
                child: TextField(
                  controller: _invoiceDiscountController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))
                  ],
                  decoration: const InputDecoration(
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(
                          vertical: 8, horizontal: 10),
                      suffix: Text('ج')),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ],
          ),
          const Divider(height: 20),
          _TotalRow(
              label: 'الصافي',
              value: '${_fmt.format(_netTotal)} جنيه',
              isBold: true,
              color: AppColors.primary),
          if (_paymentType == 'cash' && _isPartial) ...[
            const SizedBox(height: 8),
            _TotalRow(
                label: 'المدفوع',
                value: '${_fmt.format(_paidAmount)} جنيه',
                color: AppColors.success),
            const SizedBox(height: 4),
            _TotalRow(
                label: 'المتبقي',
                value:
                    '${_fmt.format(remaining < 0 ? 0 : remaining)} جنيه',
                color: AppColors.error),
          ],
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
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 2))
        ],
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
  const _TypeChip(
      {required this.label,
      required this.icon,
      required this.selected,
      required this.onTap});
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
          border: Border.all(
              color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon,
                size: 16,
                color: selected ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(label,
                style: GoogleFonts.cairo(
                    color:
                        selected ? Colors.white : AppColors.textSecondary,
                    fontWeight: FontWeight.w600)),
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
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AppColors.border)),
        child: Icon(icon, size: 16, color: AppColors.primary),
      ),
    );
  }
}

class _QtyDialogBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyDialogBtn({required this.icon, this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: onTap != null ? AppColors.primary : AppColors.border,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 20, color: Colors.white),
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? color;
  const _TotalRow(
      {required this.label,
      required this.value,
      this.isBold = false,
      this.color});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: GoogleFonts.cairo(
                color: AppColors.textSecondary, fontSize: 14)),
        Text(value,
            style: GoogleFonts.cairo(
                fontWeight: isBold ? FontWeight.w700 : FontWeight.w600,
                fontSize: isBold ? 16 : 14,
                color: color ?? AppColors.textPrimary)),
      ],
    );
  }
}
