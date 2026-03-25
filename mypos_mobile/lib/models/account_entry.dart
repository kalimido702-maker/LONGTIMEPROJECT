/// كشف حساب - حركة مالية واحدة
class AccountEntry {
  final String id;
  final String type; // 'invoice' | 'payment' | 'return' | 'bonus' | 'discount'
  final String description;
  final double debit; // مدين (فواتير)
  final double credit; // دائن (دفعات / مرتجعات)
  final double balance; // الرصيد بعد العملية
  final String? referenceId;
  final String? referenceNumber;
  final String? customerName;
  final String date;

  AccountEntry({
    required this.id,
    required this.type,
    required this.description,
    this.debit = 0,
    this.credit = 0,
    this.balance = 0,
    this.referenceId,
    this.referenceNumber,
    this.customerName,
    required this.date,
  });

  factory AccountEntry.fromJson(Map<String, dynamic> json) {
    return AccountEntry(
      id: json['id']?.toString() ?? '',
      type: json['type'] ?? '',
      description: json['description'] ?? '',
      debit: _toDouble(json['debit']),
      credit: _toDouble(json['credit']),
      balance: _toDouble(json['balance']),
      referenceId: json['reference_id']?.toString() ?? json['referenceId']?.toString(),
      referenceNumber: json['reference_number']?.toString() ?? json['referenceNumber']?.toString(),
      customerName: json['customer_name'] ?? json['customerName'],
      date: json['date'] ?? json['created_at'] ?? '',
    );
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
