class SalesRep {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final String? supervisorId;
  final String? supervisorName;
  final double commissionRate;
  final bool isActive;
  final String? notes;
  final int customerCount;
  final double totalDebt;

  SalesRep({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.supervisorId,
    this.supervisorName,
    this.commissionRate = 0,
    this.isActive = true,
    this.notes,
    this.customerCount = 0,
    this.totalDebt = 0,
  });

  factory SalesRep.fromJson(Map<String, dynamic> json) {
    return SalesRep(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      phone: json['phone'],
      email: json['email'],
      supervisorId: json['supervisor_id'] ?? json['supervisorId'],
      supervisorName: json['supervisor_name'] ?? json['supervisorName'],
      commissionRate: _toDouble(json['commission_rate'] ?? json['commissionRate']),
      isActive: _toBool(json['is_active'] ?? json['isActive'] ?? true),
      notes: json['notes'],
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

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }

  static int _toInt(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    return int.tryParse(val.toString()) ?? 0;
  }
}
