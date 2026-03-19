import 'package:flutter/material.dart';
import '../models/invoice.dart';
import '../models/payment.dart';
import '../models/sales_return.dart';
import '../models/customer.dart';
import '../models/sales_rep.dart';
import '../models/supervisor.dart';
import '../models/account_entry.dart';
import '../services/api_service.dart';

class DataProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  // State
  List<Invoice> _invoices = [];
  List<Payment> _payments = [];
  List<SalesReturn> _returns = [];
  List<Customer> _customers = [];
  List<SalesRep> _salesReps = [];
  List<Supervisor> _supervisors = [];
  List<AccountEntry> _accountEntries = [];
  bool _isLoading = false;
  String? _error;

  // Dashboard stats (from backend)
  double _totalDebt = 0;
  double _totalPaid = 0;
  double _totalRemaining = 0;
  int _totalInvoices = 0;
  int _totalPayments = 0;
  double _totalPaymentAmount = 0;
  int _totalReturns = 0;
  double _totalReturnAmount = 0;
  double _totalCustomersBalance = 0;
  double _paymentsFilteredTotal = 0;

  // Customer info (for customer role)
  Map<String, dynamic>? _customerInfo;

  // Pagination
  int _invoicePage = 1;
  int _paymentPage = 1;
  int _returnPage = 1;
  bool _hasMoreInvoices = true;
  bool _hasMorePayments = true;
  bool _hasMoreReturns = true;

  // Getters
  List<Invoice> get invoices => _invoices;
  List<Invoice> get deliveredInvoices => _invoices; // Already delivered-only from backend
  List<Payment> get payments => _payments;
  List<SalesReturn> get returns => _returns;
  List<Customer> get customers => _customers;
  List<SalesRep> get salesReps => _salesReps;
  List<Supervisor> get supervisors => _supervisors;
  List<AccountEntry> get accountEntries => _accountEntries;
  bool get isLoading => _isLoading;
  String? get error => _error;
  double get totalDebt => _totalDebt;
  double get totalPaid => _totalPaid;
  double get totalRemaining => _totalRemaining;
  int get totalInvoices => _totalInvoices;
  int get totalPayments => _totalPayments;
  double get totalPaymentAmount => _totalPaymentAmount;
  int get totalReturns => _totalReturns;
  double get totalReturnAmount => _totalReturnAmount;
  double get totalCustomersBalance => _totalCustomersBalance;
  double get paymentsFilteredTotal => _paymentsFilteredTotal > 0 ? _paymentsFilteredTotal : _totalPaymentAmount;
  Map<String, dynamic>? get customerInfo => _customerInfo;
  bool get hasMoreInvoices => _hasMoreInvoices;
  bool get hasMorePayments => _hasMorePayments;
  bool get hasMoreReturns => _hasMoreReturns;

  // ============================================================
  // Dashboard
  // ============================================================
  void clearData() {
    _invoices = [];
    _payments = [];
    _returns = [];
    _customers = [];
    _salesReps = [];
    _supervisors = [];
    _accountEntries = [];
    
    _totalDebt = 0;
    _totalPaid = 0;
    _totalRemaining = 0;
    _totalInvoices = 0;
    _totalPayments = 0;
    _totalPaymentAmount = 0;
    _totalReturns = 0;
    _totalReturnAmount = 0;
    _totalCustomersBalance = 0;
    _paymentsFilteredTotal = 0;
    _customerInfo = null;
    
    _invoicePage = 1;
    _paymentPage = 1;
    _returnPage = 1;
    _hasMoreInvoices = true;
    _hasMorePayments = true;
    _hasMoreReturns = true;
    
    notifyListeners();
  }

  Future<void> loadDashboard({String? fromDate, String? toDate}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getDashboard(fromDate: fromDate, toDate: toDate);
      final data = response['data'] as Map<String, dynamic>? ?? {};

      // Invoice stats
      final invoiceStats = data['invoices'] as Map<String, dynamic>? ?? {};
      _totalInvoices = _toInt(invoiceStats['total_invoices']);
      _totalDebt = _toDouble(invoiceStats['total_sales']);
      _totalPaid = _toDouble(invoiceStats['total_paid']);
      _totalRemaining = _toDouble(invoiceStats['total_remaining']);

      // Payment stats
      final paymentStats = data['payments'] as Map<String, dynamic>? ?? {};
      _totalPayments = _toInt(paymentStats['total_payments']);
      _totalPaymentAmount = _toDouble(paymentStats['total_payment_amount']);

      // Return stats
      final returnStats = data['returns'] as Map<String, dynamic>? ?? {};
      _totalReturns = _toInt(returnStats['total_returns']);
      _totalReturnAmount = _toDouble(returnStats['total_return_amount']);

      // Customer info (for customer role)
      _customerInfo = data['customer'] as Map<String, dynamic>?;

      // Total customers balance (for staff roles: sales_rep, supervisor, admin)
      _totalCustomersBalance = _toDouble(data['totalCustomersBalance']);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل البيانات';
      notifyListeners();
    }
  }

  // ============================================================
  // Invoices
  // ============================================================
  Future<void> loadInvoices({
    String? search,
    String? paymentStatus,
    String? fromDate,
    String? toDate,
    String? customerId,
    bool refresh = false,
  }) async {
    if (refresh) {
      _invoicePage = 1;
      _hasMoreInvoices = true;
      _invoices = [];
    }

    if (!_hasMoreInvoices) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getInvoices(
        page: _invoicePage,
        limit: 50,
        search: search,
        paymentStatus: paymentStatus,
        fromDate: fromDate,
        toDate: toDate,
        customerId: customerId,
      );

      final data = response['data'] as List? ?? [];
      final pagination = response['pagination'] as Map<String, dynamic>? ?? {};
      final newInvoices = data.map((j) => Invoice.fromJson(j as Map<String, dynamic>)).toList();

      if (refresh) {
        _invoices = newInvoices;
      } else {
        _invoices.addAll(newInvoices);
      }

      _invoicePage++;
      _hasMoreInvoices = _invoicePage <= (_toInt(pagination['pages']) > 0 ? _toInt(pagination['pages']) : 1);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل الفواتير';
      notifyListeners();
    }
  }

  /// Get single invoice with items
  Future<Invoice?> getInvoiceDetail(String id) async {
    try {
      final response = await _api.getInvoice(id);
      final data = response['data'] as Map<String, dynamic>? ?? {};
      return Invoice.fromJson(data);
    } catch (e) {
      _error = 'حدث خطأ أثناء تحميل الفاتورة';
      notifyListeners();
      return null;
    }
  }

  // ============================================================
  // Payments
  // ============================================================
  Future<void> loadPayments({
    String? search,
    String? fromDate,
    String? toDate,
    String? customerId,
    bool refresh = false,
  }) async {
    if (refresh) {
      _paymentPage = 1;
      _hasMorePayments = true;
      _payments = [];
    }

    if (!_hasMorePayments) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getPayments(
        page: _paymentPage,
        limit: 50,
        search: search,
        fromDate: fromDate,
        toDate: toDate,
        customerId: customerId,
      );

      final data = response['data'] as List? ?? [];
      final pagination = response['pagination'] as Map<String, dynamic>? ?? {};
      final newPayments = data.map((j) => Payment.fromJson(j as Map<String, dynamic>)).toList();

      if (refresh) {
        _payments = newPayments;
      } else {
        _payments.addAll(newPayments);
      }

      _paymentPage++;
      _hasMorePayments = _paymentPage <= (_toInt(pagination['pages']) > 0 ? _toInt(pagination['pages']) : 1);

      // Store server-side total for accurate display
      final totals = response['totals'] as Map<String, dynamic>? ?? {};
      if (refresh) {
        _paymentsFilteredTotal = _toDouble(totals['total_amount']);
      }

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل المدفوعات';
      notifyListeners();
    }
  }

  // ============================================================
  // Sales Returns
  // ============================================================
  Future<void> loadReturns({
    String? search,
    String? fromDate,
    String? toDate,
    String? customerId,
    bool refresh = false,
  }) async {
    if (refresh) {
      _returnPage = 1;
      _hasMoreReturns = true;
      _returns = [];
    }

    if (!_hasMoreReturns) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getReturns(
        page: _returnPage,
        limit: 50,
        search: search,
        fromDate: fromDate,
        toDate: toDate,
        customerId: customerId,
      );

      final data = response['data'] as List? ?? [];
      final pagination = response['pagination'] as Map<String, dynamic>? ?? {};
      final newReturns = data.map((j) => SalesReturn.fromJson(j as Map<String, dynamic>)).toList();

      if (refresh) {
        _returns = newReturns;
      } else {
        _returns.addAll(newReturns);
      }

      _returnPage++;
      _hasMoreReturns = _returnPage <= (_toInt(pagination['pages']) > 0 ? _toInt(pagination['pages']) : 1);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل المرتجعات';
      notifyListeners();
    }
  }

  // ============================================================
  // Account Statement (كشف حساب)
  // ============================================================
  Future<void> loadAccountStatement({
    String? customerId,
    String? fromDate,
    String? toDate,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getAccountStatement(
        customerId: customerId,
        fromDate: fromDate,
        toDate: toDate,
      );

      final data = response['data'] as Map<String, dynamic>? ?? {};
      final entries = data['entries'] as List? ?? [];
      final totals = data['totals'] as Map<String, dynamic>? ?? {};

      _accountEntries = entries.map((e) => AccountEntry.fromJson(e as Map<String, dynamic>)).toList();

      // Update totals from account statement
      _totalDebt = _toDouble(totals['debit']);
      _totalPaid = _toDouble(totals['credit']);
      _totalRemaining = _toDouble(totals['balance']);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل كشف الحساب';
      notifyListeners();
    }
  }

  /// Get account statement entries (for backward compatibility with screens)
  List<AccountEntry> getAccountStatement({String? customerId}) {
    return _accountEntries;
  }

  // ============================================================
  // Customers
  // ============================================================
  Future<void> loadCustomers({String? search, String? salesRepId, String? supervisorId}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getCustomers(search: search, limit: 500, salesRepId: salesRepId, supervisorId: supervisorId);
      final data = response['data'] as List? ?? [];
      _customers = data.map((j) => Customer.fromJson(j as Map<String, dynamic>)).toList();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل العملاء';
      notifyListeners();
    }
  }

  // ============================================================
  // Sales Reps
  // ============================================================
  Future<void> loadSalesReps({String? search, String? supervisorId}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getSalesReps(search: search, limit: 500, supervisorId: supervisorId);
      final data = response['data'] as List? ?? [];
      _salesReps = data.map((j) => SalesRep.fromJson(j as Map<String, dynamic>)).toList();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل المندوبين';
      notifyListeners();
    }
  }

  // ============================================================
  // Supervisors
  // ============================================================
  Future<void> loadSupervisors({String? search}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.getSupervisors(search: search, limit: 500);
      final data = response['data'] as List? ?? [];
      _supervisors = data.map((j) => Supervisor.fromJson(j as Map<String, dynamic>)).toList();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل المشرفين';
      notifyListeners();
    }
  }

  // ============================================================
  // Load all data at once (used on login / home screen)
  // ============================================================
  Future<void> loadAllData({String? customerId, String? fromDate, String? toDate}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Load dashboard stats
      await loadDashboard(fromDate: fromDate, toDate: toDate);

      // Load first page of each
      await Future.wait([
        loadInvoices(refresh: true, customerId: customerId, fromDate: fromDate, toDate: toDate),
        loadPayments(refresh: true, customerId: customerId, fromDate: fromDate, toDate: toDate),
        loadReturns(refresh: true, customerId: customerId, fromDate: fromDate, toDate: toDate),
      ]);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = 'حدث خطأ أثناء تحميل البيانات';
      notifyListeners();
    }
  }

  /// Convenience: load customer-specific data (backward compatibility)
  Future<void> loadCustomerData(String customerId) async {
    await loadAllData(customerId: customerId);
  }

  // ============================================================
  // Notifications
  // ============================================================
  Future<Map<String, dynamic>> loadNotifications({int page = 1}) async {
    try {
      return await _api.getNotifications(page: page);
    } catch (e) {
      return {'data': [], 'unread': 0};
    }
  }

  Future<void> markNotificationRead(String id) async {
    await _api.markNotificationRead(id);
  }

  Future<void> markAllNotificationsRead() async {
    await _api.markAllNotificationsRead();
  }

  // ============================================================
  // Helpers
  // ============================================================
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
