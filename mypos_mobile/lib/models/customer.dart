class Customer {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final String? address;
  final double currentBalance;
  final double creditLimit;
  final double bonusBalance;
  final double previousStatement;
  final String? salesRepId;
  final String? notes;
  final bool isActive;

  Customer({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.address,
    this.currentBalance = 0,
    this.creditLimit = 0,
    this.bonusBalance = 0,
    this.previousStatement = 0,
    this.salesRepId,
    this.notes,
    this.isActive = true,
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    return Customer(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      phone: json['phone'],
      email: json['email'],
      address: json['address'],
      currentBalance: _toDouble(json['currentBalance'] ?? json['current_balance']),
      creditLimit: _toDouble(json['creditLimit'] ?? json['credit_limit']),
      bonusBalance: _toDouble(json['bonusBalance'] ?? json['bonus_balance']),
      previousStatement: _toDouble(json['previousStatement'] ?? json['previous_statement']),
      salesRepId: json['salesRepId'] ?? json['sales_rep_id'],
      notes: json['notes'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
    );
  }

  static double _toDouble(dynamic val) {
    if (val == null) return 0;
    if (val is double) return val;
    if (val is int) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0;
  }
}
