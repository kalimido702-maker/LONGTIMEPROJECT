class Supervisor {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final bool isActive;
  final String? notes;
  final int salesRepCount;
  final int customerCount;
  final double totalDebt;

  Supervisor({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.isActive = true,
    this.notes,
    this.salesRepCount = 0,
    this.customerCount = 0,
    this.totalDebt = 0,
  });

  factory Supervisor.fromJson(Map<String, dynamic> json) {
    return Supervisor(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      phone: json['phone'],
      email: json['email'],
      isActive: _toBool(json['is_active'] ?? json['isActive'] ?? true),
      notes: json['notes'],
      salesRepCount: _toInt(json['sales_rep_count'] ?? json['salesRepCount']),
      customerCount: _toInt(json['customer_count'] ?? json['customerCount']),
      totalDebt: _toDouble(json['total_debt'] ?? json['totalDebt'] ?? 0),
    );
  }

  static bool _toBool(dynamic val) {
    if (val is bool) return val;
    if (val is int) return val == 1;
    if (val is String) return val == '1' || val.toLowerCase() == 'true';
    return true;
  }

  static int _toInt(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    return int.tryParse(val.toString()) ?? 0;
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
