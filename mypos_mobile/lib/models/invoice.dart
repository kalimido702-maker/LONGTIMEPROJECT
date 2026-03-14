class InvoiceItem {
  final String id;
  final String? productId;
  final String name;
  final double quantity;
  final double price;
  final double discount;
  final double total;
  final String? unitName;
  final int? unitsPerCarton;

  InvoiceItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.price,
    this.productId,
    this.discount = 0,
    this.total = 0,
    this.unitName,
    this.unitsPerCarton,
  });

  factory InvoiceItem.fromJson(Map<String, dynamic> json) {
    final qty = _toDouble(json['quantity']);
    final prc = _toDouble(json['price'] ?? json['unitPrice'] ?? json['unit_price']);
    final disc = _toDouble(json['discount']);
    return InvoiceItem(
      id: json['id']?.toString() ?? '',
      productId: json['productId']?.toString() ?? json['product_id']?.toString(),
      name: json['name'] ?? json['nameAr'] ?? json['name_ar'] ?? json['productName'] ?? '',
      quantity: qty,
      price: prc,
      discount: disc,
      total: _toDouble(json['total']) > 0 ? _toDouble(json['total']) : (qty * prc) - disc,
      unitName: json['unitName'] ?? json['unit_name'] ?? json['selectedUnitName'],
      unitsPerCarton: _toInt(json['unitsPerCarton'] ?? json['units_per_carton']),
    );
  }

  static int? _toInt(dynamic val) {
    if (val == null) return null;
    if (val is int) return val;
    return int.tryParse(val.toString());
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}

class Invoice {
  final String id;
  final String? invoiceNumber;
  final String? customerId;
  final String? customerName;
  final String? customerPhone;
  final double total;
  final double subtotal;
  final double discount;
  final double tax;
  final double netTotal;
  final double paidAmount;
  final double remainingAmount;
  final String? paymentMethod;
  final String? paymentStatus;
  final String? deliveryStatus;
  final String? notes;
  final String? userId;
  final String? userName;
  final List<InvoiceItem> items;
  final String? createdAt;
  final String type; // 'sale' or 'return'
  final double? previousBalance;
  final double? currentBalance;

  Invoice({
    required this.id,
    this.invoiceNumber,
    this.customerId,
    this.customerName,
    this.customerPhone,
    this.total = 0,
    this.subtotal = 0,
    this.discount = 0,
    this.tax = 0,
    this.netTotal = 0,
    this.paidAmount = 0,
    this.remainingAmount = 0,
    this.paymentMethod,
    this.paymentStatus,
    this.deliveryStatus,
    this.notes,
    this.userId,
    this.userName,
    this.items = const [],
    this.createdAt,
    this.type = 'sale',
    this.previousBalance,
    this.currentBalance,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    List<InvoiceItem> itemsList = [];
    if (json['items'] != null) {
      if (json['items'] is List) {
        itemsList = (json['items'] as List)
            .map((item) => InvoiceItem.fromJson(item is Map<String, dynamic> ? item : {}))
            .toList();
      } else if (json['items'] is String) {
        // JSON string
        try {
          final parsed = json['items'];
          if (parsed is List) {
            itemsList = parsed.map((item) => InvoiceItem.fromJson(item)).toList();
          }
        } catch (_) {}
      }
    }

    return Invoice(
      id: json['id']?.toString() ?? '',
      invoiceNumber: json['invoiceNumber']?.toString() ?? json['invoice_number']?.toString(),
      customerId: json['customerId']?.toString() ?? json['customer_id']?.toString(),
      customerName: json['customerName'] ?? json['customer_name'],
      customerPhone: json['customerPhone'] ?? json['customer_phone'],
      total: _toDouble(json['total'] ?? json['total_amount']),
      subtotal: _toDouble(json['subtotal']),
      discount: _toDouble(json['discount'] ?? json['discount_amount']),
      tax: _toDouble(json['tax'] ?? json['tax_amount']),
      netTotal: _toDouble(json['netTotal'] ?? json['net_total']),
      paidAmount: _toDouble(json['paidAmount'] ?? json['paid_amount']),
      remainingAmount: _toDouble(json['remainingAmount'] ?? json['remaining_amount']),
      paymentMethod: json['paymentMethod'] ?? json['payment_method'],
      paymentStatus: json['paymentStatus'] ?? json['payment_status'],
      deliveryStatus: json['deliveryStatus'] ?? json['delivery_status'],
      notes: json['notes'],
      userId: json['userId']?.toString() ?? json['user_id']?.toString(),
      userName: json['userName'] ?? json['user_name'],
      items: itemsList,
      createdAt: json['createdAt'] ?? json['created_at'],
      type: json['type'] ?? (json['invoiceType'] ?? json['invoice_type'] ?? 'sale'),
      previousBalance: _toNullableDouble(json['previousBalance'] ?? json['previous_balance']),
      currentBalance: _toNullableDouble(json['currentBalance'] ?? json['current_balance']),
    );
  }

  bool get isDelivered => deliveryStatus == 'delivered' || deliveryStatus == 'تم التسليم';
  bool get isReturn => type == 'return' || type == 'sales_return';
  bool get isPaid => paymentStatus == 'paid' || remainingAmount <= 0;
  bool get isPartial => paymentStatus == 'partial' || (paidAmount > 0 && remainingAmount > 0);

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }

  static double? _toNullableDouble(dynamic val) {
    if (val == null) return null;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString());
  }
}
