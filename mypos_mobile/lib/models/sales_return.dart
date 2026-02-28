class SalesReturn {
  final String id;
  final String? returnNumber;
  final String? invoiceId;
  final String? invoiceNumber;
  final String? customerId;
  final String? customerName;
  final double total;
  final double totalAmount;
  final String? refundMethod;
  final String? refundStatus;
  final String? reason;
  final String? notes;
  final String? userId;
  final String? userName;
  final String? createdAt;
  final List<dynamic> items;

  SalesReturn({
    required this.id,
    this.returnNumber,
    this.invoiceId,
    this.invoiceNumber,
    this.customerId,
    this.customerName,
    this.total = 0,
    this.totalAmount = 0,
    this.refundMethod,
    this.refundStatus,
    this.reason,
    this.notes,
    this.userId,
    this.userName,
    this.createdAt,
    this.items = const [],
  });

  factory SalesReturn.fromJson(Map<String, dynamic> json) {
    return SalesReturn(
      id: json['id']?.toString() ?? '',
      returnNumber: json['returnNumber']?.toString() ?? json['return_number']?.toString(),
      invoiceId: json['invoiceId']?.toString() ?? json['invoice_id']?.toString(),
      invoiceNumber: json['invoiceNumber']?.toString() ?? json['invoice_number']?.toString(),
      customerId: json['customerId']?.toString() ?? json['customer_id']?.toString(),
      customerName: json['customerName'] ?? json['customer_name'],
      total: _toDouble(json['total']),
      totalAmount: _toDouble(json['totalAmount'] ?? json['total_amount']),
      refundMethod: json['refundMethod'] ?? json['refund_method'],
      refundStatus: json['refundStatus'] ?? json['refund_status'],
      reason: json['reason'],
      notes: json['notes'],
      userId: json['userId']?.toString() ?? json['user_id']?.toString(),
      userName: json['userName'] ?? json['user_name'],
      createdAt: json['createdAt'] ?? json['created_at'],
      items: json['items'] is List ? json['items'] : [],
    );
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
