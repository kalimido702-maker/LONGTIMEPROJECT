import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
// ignore_for_file: deprecated_member_use
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/invoice.dart';

/// Generates invoice PDF using the exact same HTML template as the desktop app.
/// Uses [Printing.convertHtml] for native HTML→PDF rendering with full
/// Arabic/RTL support via the Cairo Google Font.
class InvoicePdfService {
  static String? _logoBase64;

  /// Load logo as base64 data URI (cached)
  static Future<String> _getLogoBase64() async {
    if (_logoBase64 != null) return _logoBase64!;
    try {
      final data = await rootBundle.load('assets/images/logo.png');
      final bytes = data.buffer.asUint8List();
      _logoBase64 = 'data:image/png;base64,${base64Encode(bytes)}';
    } catch (_) {
      _logoBase64 = '';
    }
    return _logoBase64!;
  }

  /// Format number with commas, no unnecessary decimals
  static String _fmt(double n, {int maxDec = 2}) {
    final hasDecimals = n % 1 != 0;
    if (!hasDecimals) {
      return n.toStringAsFixed(0).replaceAllMapped(
            RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
            (m) => '${m[1]},',
          );
    }
    return n.toStringAsFixed(maxDec).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  /// Build the exact same HTML template used by the desktop Electron app
  static Future<String> generateInvoiceHTML(Invoice invoice) async {
    final logoBase64 = await _getLogoBase64();
    final isReturn = invoice.isReturn;

    // Parse date
    String dateStr = '';
    try {
      final dt = DateTime.parse(invoice.createdAt ?? '');
      dateStr =
          '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      dateStr = invoice.createdAt ?? '';
    }

    final invoiceNum = invoice.invoiceNumber ?? invoice.id.substring(0, 8);

    // Build item rows
    final itemsRows = StringBuffer();
    for (var i = 0; i < invoice.items.length; i++) {
      final item = invoice.items[i];
      itemsRows.writeln('''
        <tr>
            <td class="col-index">${i + 1}</td>
            <td class="col-name">${_escapeHtml(item.name)}</td>
            <td class="col-qty">${_fmt(item.quantity, maxDec: 0)}</td>
            <td class="col-unit">${_escapeHtml(item.unitName ?? 'قطعة')}</td>
            <td class="col-price">${_fmt(item.price)}</td>
            <td class="col-total">${_fmt(item.total)}</td>
        </tr>
      ''');
    }

    // Build totals rows
    final totalsHtml = StringBuffer();
    final hasDiscount = invoice.discount > 0;

    if (hasDiscount) {
      final subtotal = invoice.subtotal > 0
          ? invoice.subtotal
          : invoice.total + invoice.discount;
      totalsHtml.writeln('''
        <div class="total-row">
            <span>الإجمالي</span>
            <span class="amount">${_fmt(subtotal)}</span>
        </div>
        <div class="total-row">
            <span>الخصم</span>
            <span class="amount">${_fmt(invoice.discount)}</span>
        </div>
        <div class="total-row">
            <span>الإجمالي بعد الخصم</span>
            <span class="amount">${_fmt(invoice.total)}</span>
        </div>
      ''');
    } else {
      totalsHtml.writeln('''
        <div class="total-row">
            <span>الإجمالي</span>
            <span class="amount">${_fmt(invoice.total)}</span>
        </div>
      ''');
    }

    if (invoice.paidAmount > 0) {
      totalsHtml.writeln('''
        <div class="total-row">
            <span>المدفوع</span>
            <span class="amount">${_fmt(invoice.paidAmount)}</span>
        </div>
      ''');
    }
    if (invoice.remainingAmount > 0) {
      totalsHtml.writeln('''
        <div class="total-row">
            <span>المتبقي</span>
            <span class="amount">${_fmt(invoice.remainingAmount)}</span>
        </div>
      ''');
    }

    // Notes section
    final notesHtml = (invoice.notes != null && invoice.notes!.isNotEmpty)
        ? '''
        <div class="notes-section">
            <div class="notes-label">ملاحظات:</div>
            <div class="notes-text">${_escapeHtml(invoice.notes!)}</div>
        </div>
        '''
        : '';

    return '''
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isReturn ? 'فاتورة مرتجعات' : 'فاتورة بيع'} رقم $invoiceNum</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        
        @page {
            size: A4;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            direction: rtl;
            background: #fff;
            color: #000;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            position: relative;
        }
        
        .invoice-container {
            padding: 10mm 12mm 12mm 12mm;
        }
        
        /* ===== HEADER SECTION ===== */
        .header-section {
            display: flex;
            flex-direction: row-reverse;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .header-top {
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-start;
            margin-bottom: 0;
        }
        
        .logo-section {
            text-align: left;
            margin-right: auto;
            margin-left: 0;
        }
        
        .logo-container {
            width: 150px;
        }
        
        .logo {
            width: 100%;
            height: auto;
        }
        
        /* ===== META TABLE ===== */
        .meta-section {
            margin-top: 15px;
        }
        
        .meta-table {
            border-collapse: collapse;
            width: 200px;
        }
        
        .meta-table th {
            background: #2d8a9e;
            color: white;
            padding: 5px 6px;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            border: none;
        }
        
        .meta-table td {
            background: #fff;
            padding: 5px 6px;
            font-size: 14px;
            font-weight: 700;
            text-align: center;
            border: none;
            border-bottom: 4px solid #2d8a9e;
        }
        
        /* ===== COMPANY NAME & INVOICE TYPE BAR ===== */
        .company-section {
            text-align: right;
            margin-bottom: 10px;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: 800;
            color: #000;
        }
        
        .invoice-type-bar {
            background: #2d8a9e;
            color: white;
            display: block;
            padding: 4px 20px 4px 12px;
            font-size: 13px;
            font-weight: 600;
            margin-top: 4px;
        }
        
        /* ===== CUSTOMER SECTION ===== */
        .customer-section {
            margin-bottom: 8px;
            margin-top: 8px;
            text-align: right;
        }
        
        .customer-name {
            font-size: 18px;
            font-weight: 800;
            color: #000;
        }
        
        .customer-address {
            font-size: 14px;
            color: #333;
            font-weight: 600;
            margin-top: 3px;
        }
        
        /* ===== ITEMS TABLE ===== */
        .items-table-container {
            margin-bottom: 15px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .items-table th {
            background: #2d8a9e;
            color: white;
            padding: 7px 4px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            vertical-align: middle;
            border: 1px solid rgba(255,255,255,0.3);
            border-bottom: 2px solid #2d8a9e;
        }
        
        .items-table th.col-name {
            text-align: right;
            padding-right: 10px;
        }
        
        .items-table td {
            padding: 8px 4px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            vertical-align: middle;
            color: #000;
            border: 1px solid #aaa;
            border-bottom: 1px solid #888;
        }
        
        .items-table td.col-name {
            text-align: right;
            padding-right: 10px;
            font-size: 13px;
        }
        
        .items-table td.col-index {
            font-weight: 700;
        }
        
        .items-table td.col-total {
            font-weight: 700;
        }
        
        /* Column widths */
        .col-index { width: 6%; }
        .col-name { width: 40%; }
        .col-qty { width: 10%; }
        .col-unit { width: 12%; }
        .col-price { width: 16%; }
        .col-total { width: 16%; }
        
        /* Outer borders */
        .items-table th.col-index,
        .items-table td.col-index {
            border-right: 2px solid #2d8a9e;
        }
        .items-table th.col-total,
        .items-table td.col-total {
            border-left: 2px solid #2d8a9e;
        }
        .items-table thead th {
            border-top: 2px solid #2d8a9e;
        }
        .items-table tbody tr:last-child td {
            border-bottom: 2px solid #2d8a9e;
        }
        
        /* ===== FOOTER ===== */
        .footer {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 12px;
        }
        
        .totals-block {
            width: 260px;
            order: 2;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            font-size: 15px;
            font-weight: 700;
            border-bottom: 2px solid #000;
        }
        
        .total-row .amount {
            font-weight: 800;
        }
        
        .qr-section {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 12px;
            order: 1;
        }
        
        .site-url {
            font-size: 14px;
            font-weight: 700;
            color: #2d8a9e;
            text-decoration: none;
        }
        
        /* ===== NOTES SECTION ===== */
        .notes-section {
            margin-top: 12px;
            padding: 8px 12px;
            border: 1.5px solid #2d8a9e;
            border-radius: 4px;
            text-align: right;
        }
        
        .notes-label {
            font-size: 13px;
            font-weight: 700;
            color: #2d8a9e;
            margin-bottom: 4px;
        }
        
        .notes-text {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            line-height: 1.6;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="header-section">
            <!-- Logo + Meta Table (Left in RTL) -->
            <div class="header-top">
                <div class="meta-section">
                    <table class="meta-table">
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>$invoiceNum</td>
                                <td>$dateStr</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="logo-section">
                    <div class="logo-container">
                        ${logoBase64.isNotEmpty ? '<img src="$logoBase64" class="logo" alt="Logo">' : ''}
                    </div>
                </div>
            </div>
            
            <!-- Company Name & Customer (Right in RTL) -->
            <div class="company-section">
                <div class="company-name">لونج تايم للصناعات الكهربائية</div>
                <div class="invoice-type-bar">${isReturn ? 'مرتجع من:' : 'فاتورة إلى:'}</div>
                <div class="customer-section">
                    <div class="customer-name">السادة / ${_escapeHtml(invoice.customerName ?? '')}</div>
                </div>
            </div>
        </div>
        
        <!-- Items Table -->
        <div class="items-table-container">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-index">م</th>
                        <th class="col-name">اسم الصنف</th>
                        <th class="col-qty">الكمية</th>
                        <th class="col-unit">الوحدة</th>
                        <th class="col-price">الفئة</th>
                        <th class="col-total">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    $itemsRows
                </tbody>
            </table>
        </div>
        
        <!-- Footer: QR/Website (right) + Totals (left) -->
        <div class="footer">
            <div class="qr-section">
                <a href="https://longtimelt.com" class="site-url">longtimelt.com</a>
            </div>

            <div class="totals-block">
                $totalsHtml
            </div>
        </div>
        
        $notesHtml
    </div>
</body>
</html>
    ''';
  }

  /// Escape HTML special characters
  static String _escapeHtml(String text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
  }

  /// Generate PDF bytes from the HTML template using native rendering
  static Future<Uint8List> generatePdf(Invoice invoice) async {
    final html = await generateInvoiceHTML(invoice);
    final pdfBytes = await Printing.convertHtml(
      html: html,
      format: PdfPageFormat.a4,
    );
    return pdfBytes;
  }

  /// Generate PDF and share it
  static Future<void> shareInvoice(Invoice invoice) async {
    final pdfBytes = await generatePdf(invoice);

    final dir = await getTemporaryDirectory();
    final invNum = invoice.invoiceNumber ?? invoice.id.substring(0, 8);
    final safeDir = Directory('${dir.path}/pdf');
    if (!await safeDir.exists()) {
      await safeDir.create(recursive: true);
    }
    final customerName = invoice.customerName ?? '';
    final fileName = 'فاتورة $invNum - $customerName.pdf';
    final file = File('${safeDir.path}/$fileName');
    await file.writeAsBytes(pdfBytes);

    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        subject: 'فاتورة $invNum - $customerName',
      ),
    );
  }
}
