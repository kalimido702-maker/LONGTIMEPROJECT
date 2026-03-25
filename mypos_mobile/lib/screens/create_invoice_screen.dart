import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../config/theme.dart';

class CartItem {
  final String productId;
  final String name;
  final double price;
  double quantity;
  double discount;
  String? unitName;

  CartItem({
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
  final _formKey = GlobalKey<FormState>();
  final _searchController = TextEditingController();
  final _notesController = TextEditingController();
  final _discountController = TextEditingController(text: '0');

  bool _isLoading = false;
  bool _isLoadingProducts = false;
  bool _isSaving = false;

  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _paymentMethods = [];
  List<CartItem> _cart = [];

  Map<String, dynamic>? _selectedCustomer;
  Map<String, dynamic>? _selectedPaymentMethod;
  String _paymentType = 'cash'; // cash or credit
  DateTime _invoiceDate = DateTime.now();

  final _currencyFormat = NumberFormat('#,##0.00', 'ar');

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _notesController.dispose();
    _discountController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final results = await Future.wait([
        api.getProducts(),
        api.getPaymentMethods(),
        api.getCustomers(),
      ]);
      setState(() {
        _products = results[0];
        _paymentMethods = results[1];
        _customers = results[2]['data'] as List<Map<String, dynamic>>? ??
            (results[2]['data'] as List).cast<Map<String, dynamic>>();
        if (_paymentMethods.isNotEmpty) {
          _selectedPaymentMethod = _paymentMethods.first;
        }
      });
    } catch (e) {
      _showError('فشل تحميل البيانات: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _searchProducts(String query) async {
    if (_isLoadingProducts) return;
    setState(() => _isLoadingProducts = true);
    try {
      final api = ApiService();
      final products = await api.getProducts(search: query);
      setState(() => _products = products);
    } catch (_) {}
    finally { setState(() => _isLoadingProducts = false); }
  }

  void _addToCart(Map<String, dynamic> product) {
    final existing = _cart.indexWhere((i) => i.productId == product['id'].toString());
    setState(() {
      if (existing >= 0) {
        _cart[existing].quantity++;
      } else {
        _cart.add(CartItem(
          productId: product['id'].toString(),
          name: product['name'] ?? '',
          price: double.tryParse(product['sale_price'].toString()) ?? 0,
          unitName: product['unit_name'],
        ));
      }
    });
  }

  void _removeFromCart(int index) => setState(() => _cart.removeAt(index));

  double get _subtotal => _cart.fold(0, (s, i) => s + i.total);
  double get _invoiceDiscount => double.tryParse(_discountController.text) ?? 0;
  double get _netTotal => _subtotal - _invoiceDiscount;

  Future<void> _saveInvoice() async {
    if (_cart.isEmpty) { _showError('أضف منتجاً على الأقل'); return; }
    if (_selectedCustomer == null) { _showError('اختر العميل'); return; }
    setState(() => _isSaving = true);
    try {
      final api = ApiService();
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final invoiceNumber = 'MOB-${DateTime.now().millisecondsSinceEpoch}';
      final data = {
        'invoiceNumber': invoiceNumber,
        'invoiceDate': _invoiceDate.toIso8601String(),
        'customerId': _selectedCustomer!['id'].toString(),
        'customerName': _selectedCustomer!['name'],
        'total': _subtotal,
        'discount': _invoiceDiscount,
        'netTotal': _netTotal,
        'paidAmount': _paymentType == 'cash' ? _netTotal : 0.0,
        'remainingAmount': _paymentType == 'cash' ? 0.0 : _netTotal,
        'paymentStatus': _paymentType == 'cash' ? 'paid' : 'unpaid',
        'paymentType': _paymentType,
        'notes': _notesController.text,
        'items': _cart.map((i) => {
          'id': 'item-${DateTime.now().microsecondsSinceEpoch}-${i.productId}',
          'productId': i.productId,
          'name': i.name,
          'quantity': i.quantity,
          'price': i.price,
          'discount': i.discount,
          'total': i.total,
          'unitName': i.unitName ?? '',
        }).toList(),
      };
      await api.createInvoice(data);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم إنشاء الفاتورة بنجاح'), backgroundColor: Colors.green),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _showError('فشل إنشاء الفاتورة: $e');
    } finally {
      setState(() => _isSaving = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('فاتورة بيع جديدة'),
        actions: [
          if (_isSaving)
            const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
          else
            TextButton.icon(
              onPressed: _saveInvoice,
              icon: const Icon(LucideIcons.save, size: 18),
              label: const Text('حفظ'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Customer & date
                _buildHeader(),
                const Divider(height: 1),
                // Product search
                _buildProductSearch(),
                const Divider(height: 1),
                // Cart
                Expanded(child: _buildCart()),
                // Summary
                _buildSummary(),
              ],
            ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          // Customer picker
          DropdownButtonFormField<Map<String, dynamic>>(
            decoration: const InputDecoration(labelText: 'العميل', border: OutlineInputBorder(), isDense: true),
            value: _selectedCustomer,
            items: _customers.map((c) => DropdownMenuItem(
              value: c,
              child: Text(c['name']?.toString() ?? ''),
            )).toList(),
            onChanged: (v) => setState(() => _selectedCustomer = v),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              // Payment type
              Expanded(
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'cash', label: Text('نقدي')),
                    ButtonSegment(value: 'credit', label: Text('آجل')),
                  ],
                  selected: {_paymentType},
                  onSelectionChanged: (s) => setState(() => _paymentType = s.first),
                ),
              ),
              const SizedBox(width: 8),
              // Date
              TextButton.icon(
                icon: const Icon(LucideIcons.calendar, size: 16),
                label: Text(DateFormat('dd/MM/yyyy').format(_invoiceDate)),
                onPressed: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _invoiceDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                  );
                  if (d != null) setState(() => _invoiceDate = d);
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProductSearch() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'ابحث عن منتج...',
              prefixIcon: const Icon(LucideIcons.search, size: 18),
              border: const OutlineInputBorder(),
              isDense: true,
              suffixIcon: _isLoadingProducts ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : null,
            ),
            onChanged: (v) => _searchProducts(v),
          ),
        ),
        SizedBox(
          height: 120,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: _products.length,
            itemBuilder: (context, index) {
              final p = _products[index];
              return GestureDetector(
                onTap: () => _addToCart(p),
                child: Container(
                  width: 110,
                  margin: const EdgeInsets.only(left: 8),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.package, size: 24),
                      const SizedBox(height: 4),
                      Text(p['name']?.toString() ?? '', textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 4),
                      Text('${_currencyFormat.format(double.tryParse(p['sale_price'].toString()) ?? 0)}', style: const TextStyle(fontSize: 11, color: Colors.green, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCart() {
    if (_cart.isEmpty) {
      return const Center(child: Text('لم تضف منتجات بعد', style: TextStyle(color: Colors.grey)));
    }
    return ListView.builder(
      itemCount: _cart.length,
      itemBuilder: (context, index) {
        final item = _cart[index];
        return ListTile(
          dense: true,
          title: Text(item.name),
          subtitle: Text('${item.price} × ${item.quantity} = ${_currencyFormat.format(item.total)}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(icon: const Icon(LucideIcons.minus, size: 16), onPressed: () {
                setState(() { if (item.quantity > 1) item.quantity--; else _cart.removeAt(index); });
              }),
              Text('${item.quantity}'),
              IconButton(icon: const Icon(LucideIcons.plus, size: 16), onPressed: () => setState(() => item.quantity++)),
              IconButton(icon: const Icon(LucideIcons.trash2, size: 16, color: Colors.red), onPressed: () => _removeFromCart(index)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSummary() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border(top: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Column(
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('المجموع:'), Text(_currencyFormat.format(_subtotal), style: const TextStyle(fontWeight: FontWeight.bold)),
          ]),
          const SizedBox(height: 4),
          Row(children: [
            const Text('خصم: '),
            const SizedBox(width: 8),
            SizedBox(width: 80, child: TextField(
              controller: _discountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
              onChanged: (_) => setState(() {}),
            )),
          ]),
          const SizedBox(height: 4),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('الصافي:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            Text(_currencyFormat.format(_netTotal), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.green)),
          ]),
        ],
      ),
    );
  }
}
