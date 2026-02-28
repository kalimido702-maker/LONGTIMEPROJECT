class Payment {
  final String id;
  final String? customerId;
  final String? customerName;
  final double amount;
  final String? paymentMethodId;
  final String? paymentMethodName;
  final String? notes;
  final String? userId;
  final String? userName;
  final String? createdAt;
  final String? invoiceId;

  Payment({
    required this.id,
    this.customerId,
    this.customerName,
    this.amount = 0,
    this.paymentMethodId,
    this.paymentMethodName,
    this.notes,
    this.userId,
    this.userName,
    this.createdAt,
    this.invoiceId,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id']?.toString() ?? '',
      customerId: json['customerId']?.toString() ?? json['customer_id']?.toString(),
      customerName: json['customerName'] ?? json['customer_name'],
      amount: _toDouble(json['amount']),
      paymentMethodId: json['paymentMethodId']?.toString() ?? json['payment_method_id']?.toString(),
      paymentMethodName: json['paymentMethodName'] ?? json['payment_method_name'],
      notes: json['notes'],
      userId: json['userId']?.toString() ?? json['user_id']?.toString(),
      userName: json['userName'] ?? json['user_name'],
      createdAt: json['createdAt'] ?? json['created_at'],
      invoiceId: json['invoiceId']?.toString() ?? json['invoice_id']?.toString(),
    );
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
