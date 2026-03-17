class User {
  final String id;
  final String username;
  final String fullName;
  final String role;
  final String clientId;
  final String branchId;
  final List<String> permissions;

  User({
    required this.id,
    required this.username,
    required this.fullName,
    required this.role,
    required this.clientId,
    required this.branchId,
    this.permissions = const [],
  });

  factory User.fromJson(Map<String, dynamic> json) {
    print("Role is ${json['role']}");
    print("Permissions is ${json['permissions']}");
    return User(
      id: json['id']?.toString() ?? '',
      username: json['username'] ?? '',
      fullName: json['fullName'] ?? json['full_name'] ?? json['name'] ?? '',
      role: (json['role'] as String?)?.toLowerCase() ?? 'customer',
      clientId: json['clientId'] ?? json['client_id'] ?? '',
      branchId: json['branchId'] ?? json['branch_id'] ?? '',
      permissions: json['permissions'] != null
          ? List<String>.from(json['permissions'])
          : [],
    );
  }

  bool get isAdmin => role == 'admin';
  bool get isSupervisor => role == 'supervisor';
  bool get isSalesRep => role == 'sales_rep' || role == 'salesRep';
  bool get isCustomer => role == 'customer';

  bool hasPermission(String permission) {
    if (isAdmin) return true;
    return permissions.contains(permission);
  }
}
