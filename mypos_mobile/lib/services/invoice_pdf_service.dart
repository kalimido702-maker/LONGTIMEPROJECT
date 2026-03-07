import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/invoice.dart';

/// Replicates the exact POS invoice PDF layout:
/// - Header: Logo (left) + Company name & invoice type bar (right)
/// - Meta: Invoice number + Date table below logo
/// - Customer: "السادة / <name>" with address
/// - Items table: م | اسم الصنف | الكمية | الوحدة | الفئة | الإجمالي
/// - Footer: Totals (left) + QR section (right)
/// - Notes section if present
class InvoicePdfService {
  // POS invoice theme color: #2d8a9e
  static const _themeColor = PdfColor.fromInt(0xFF2D8A9E);
  static const _black = PdfColor.fromInt(0xFF000000);
  static const _white = PdfColor.fromInt(0xFFFFFFFF);
  static const _grey = PdfColor.fromInt(0xFF333333);
  static const _lightGrey = PdfColor.fromInt(0xFFAAAAAA);
  static const _darkGrey = PdfColor.fromInt(0xFF888888);

  static pw.Font? _cairoRegular;
  static pw.Font? _cairoBold;
  static Uint8List? _logoBytes;

  /// Load fonts and logo once
  static Future<void> _ensureAssets() async {
    if (_cairoRegular == null) {
      // Use Arabic-compatible font
      final regularData = await rootBundle.load('assets/fonts/Cairo-Regular.ttf');
      _cairoRegular = pw.Font.ttf(regularData);
    }
    if (_cairoBold == null) {
      final boldData = await rootBundle.load('assets/fonts/Cairo-Bold.ttf');
      _cairoBold = pw.Font.ttf(boldData);
    }
    if (_logoBytes == null) {
      try {
        final data = await rootBundle.load('assets/images/logo.png');
        _logoBytes = data.buffer.asUint8List();
      } catch (_) {}
    }
  }

  /// Format number (no unnecessary decimals)
  static String _formatNum(double num, {int maxDecimals = 2}) {
    if (num == num.roundToDouble() && maxDecimals >= 0) {
      return num.toStringAsFixed(0).replaceAllMapped(
            RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
            (m) => '${m[1]},',
          );
    }
    return num.toStringAsFixed(maxDecimals).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }

  /// Generate invoice PDF bytes
  static Future<Uint8List> generatePdf(Invoice invoice) async {
    await _ensureAssets();

    final pdf = pw.Document(
      theme: pw.ThemeData.withFont(
        base: _cairoRegular,
        bold: _cairoBold,
      ),
    );
    final isReturn = invoice.isReturn;

    // Parse date
    String dateStr = '';
    try {
      final dt = DateTime.parse(invoice.createdAt ?? '');
      dateStr = '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      dateStr = invoice.createdAt ?? '';
    }

    final invoiceNum = invoice.invoiceNumber ?? invoice.id.substring(0, 8);

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        textDirection: pw.TextDirection.rtl,
        margin: const pw.EdgeInsets.fromLTRB(12 * PdfPageFormat.mm, 10 * PdfPageFormat.mm, 12 * PdfPageFormat.mm, 12 * PdfPageFormat.mm),
        build: (context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              // ===== HEADER SECTION =====
              _buildHeader(invoiceNum, dateStr, isReturn, invoice),

              pw.SizedBox(height: 8),

              // ===== ITEMS TABLE =====
              _buildItemsTable(invoice.items),

              pw.SizedBox(height: 12),

              // ===== FOOTER: Totals + Info =====
              _buildFooter(invoice),

              // ===== NOTES =====
              if (invoice.notes != null && invoice.notes!.isNotEmpty) ...[
                pw.SizedBox(height: 12),
                _buildNotes(invoice.notes!),
              ],
            ],
          );
        },
      ),
    );

    return pdf.save();
  }

  /// Header: Logo+Meta (left) | Company+Customer (right)
  static pw.Widget _buildHeader(String invoiceNum, String dateStr, bool isReturn, Invoice invoice) {
    return pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        // Right side (RTL): Company name + invoice type + customer
        pw.Expanded(
          flex: 3,
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                'لونج تايم للصناعات الكهربائية',
                style: pw.TextStyle(
                  font: _cairoBold,
                  fontSize: 22,
                  fontWeight: pw.FontWeight.bold,
                  color: _black,
                ),
                textDirection: pw.TextDirection.rtl,
              ),
              pw.SizedBox(height: 4),
              // Invoice type bar
              pw.Container(
                width: double.infinity,
                padding: const pw.EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                color: _themeColor,
                child: pw.Text(
                  isReturn ? 'مرتجع من:' : 'فاتورة إلى:',
                  style: pw.TextStyle(
                    font: _cairoBold,
                    fontSize: 13,
                    fontWeight: pw.FontWeight.bold,
                    color: _white,
                  ),
                  textDirection: pw.TextDirection.rtl,
                ),
              ),
              pw.SizedBox(height: 8),
              // Customer name
              pw.Text(
                'السادة / ${invoice.customerName ?? ''}',
                style: pw.TextStyle(
                  font: _cairoBold,
                  fontSize: 16,
                  fontWeight: pw.FontWeight.bold,
                  color: _black,
                ),
                textDirection: pw.TextDirection.rtl,
              ),
            ],
          ),
        ),

        pw.SizedBox(width: 20),

        // Left side (RTL): Logo + Meta table
        pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            // Logo
            if (_logoBytes != null)
              pw.Container(
                width: 120,
                child: pw.Image(pw.MemoryImage(_logoBytes!)),
              ),
            pw.SizedBox(height: 12),
            // Meta table: Invoice number + Date
            pw.Table(
              border: null,
              columnWidths: {
                0: const pw.FixedColumnWidth(90),
                1: const pw.FixedColumnWidth(90),
              },
              children: [
                // Header row
                pw.TableRow(
                  children: [
                    pw.Container(
                      padding: const pw.EdgeInsets.all(4),
                      color: _themeColor,
                      child: pw.Center(
                        child: pw.Text(
                          'رقم الفاتورة',
                          style: pw.TextStyle(font: _cairoBold, fontSize: 10, color: _white, fontWeight: pw.FontWeight.bold),
                          textDirection: pw.TextDirection.rtl,
                        ),
                      ),
                    ),
                    pw.Container(
                      padding: const pw.EdgeInsets.all(4),
                      color: _themeColor,
                      child: pw.Center(
                        child: pw.Text(
                          'التاريخ',
                          style: pw.TextStyle(font: _cairoBold, fontSize: 10, color: _white, fontWeight: pw.FontWeight.bold),
                          textDirection: pw.TextDirection.rtl,
                        ),
                      ),
                    ),
                  ],
                ),
                // Data row
                pw.TableRow(
                  children: [
                    pw.Container(
                      padding: const pw.EdgeInsets.all(5),
                      decoration: const pw.BoxDecoration(
                        border: pw.Border(bottom: pw.BorderSide(color: _themeColor, width: 3)),
                      ),
                      child: pw.Center(
                        child: pw.Text(
                          invoiceNum,
                          style: pw.TextStyle(font: _cairoBold, fontSize: 12, fontWeight: pw.FontWeight.bold),
                          textDirection: pw.TextDirection.rtl,
                        ),
                      ),
                    ),
                    pw.Container(
                      padding: const pw.EdgeInsets.all(5),
                      decoration: const pw.BoxDecoration(
                        border: pw.Border(bottom: pw.BorderSide(color: _themeColor, width: 3)),
                      ),
                      child: pw.Center(
                        child: pw.Text(
                          dateStr,
                          style: pw.TextStyle(font: _cairoBold, fontSize: 12, fontWeight: pw.FontWeight.bold),
                          textDirection: pw.TextDirection.rtl,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  /// Items table matching POS layout
  static pw.Widget _buildItemsTable(List<InvoiceItem> items) {
    final headerStyle = pw.TextStyle(
      font: _cairoBold,
      fontSize: 11,
      fontWeight: pw.FontWeight.bold,
      color: _white,
    );
    final cellStyle = pw.TextStyle(
      font: _cairoRegular,
      fontSize: 11,
      color: _black,
    );
    final cellBoldStyle = pw.TextStyle(
      font: _cairoBold,
      fontSize: 11,
      fontWeight: pw.FontWeight.bold,
      color: _black,
    );

    return pw.Table(
      border: pw.TableBorder(
        left: const pw.BorderSide(color: _themeColor, width: 2),
        right: const pw.BorderSide(color: _themeColor, width: 2),
        top: const pw.BorderSide(color: _themeColor, width: 2),
        bottom: const pw.BorderSide(color: _themeColor, width: 2),
        horizontalInside: const pw.BorderSide(color: _lightGrey, width: 0.5),
        verticalInside: const pw.BorderSide(color: _lightGrey, width: 0.5),
      ),
      columnWidths: {
        0: const pw.FlexColumnWidth(1),   // م
        1: const pw.FlexColumnWidth(6),   // اسم الصنف
        2: const pw.FlexColumnWidth(1.5), // الكمية
        3: const pw.FlexColumnWidth(2),   // الوحدة
        4: const pw.FlexColumnWidth(2.5), // الفئة
        5: const pw.FlexColumnWidth(2.5), // الإجمالي
      },
      children: [
        // Header row
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: _themeColor),
          children: [
            _headerCell('م', headerStyle),
            _headerCell('اسم الصنف', headerStyle, align: pw.Alignment.centerRight),
            _headerCell('الكمية', headerStyle),
            _headerCell('الوحدة', headerStyle),
            _headerCell('الفئة', headerStyle),
            _headerCell('الإجمالي', headerStyle),
          ].reversed.toList(),
        ),
        // Item rows
        ...items.asMap().entries.map((entry) {
          final idx = entry.key;
          final item = entry.value;
          return pw.TableRow(
            children: [
              _dataCell('${idx + 1}', cellBoldStyle),
              _dataCell(item.name, cellStyle, align: pw.Alignment.centerRight),
              _dataCell(_formatNum(item.quantity, maxDecimals: 0), cellStyle),
              _dataCell(item.unitName ?? 'قطعة', cellStyle),
              _dataCell(_formatNum(item.price), cellStyle),
              _dataCell(_formatNum(item.total), cellBoldStyle),
            ].reversed.toList(),
          );
        }),
      ],
    );
  }

  static pw.Widget _headerCell(String text, pw.TextStyle style, {pw.Alignment align = pw.Alignment.center}) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      alignment: align,
      child: pw.Text(text, style: style, textDirection: pw.TextDirection.rtl),
    );
  }

  static pw.Widget _dataCell(String text, pw.TextStyle style, {pw.Alignment align = pw.Alignment.center}) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      alignment: align,
      child: pw.Text(text, style: style, textDirection: pw.TextDirection.rtl, maxLines: 2),
    );
  }

  /// Footer: Totals block (matching POS layout)
  static pw.Widget _buildFooter(Invoice invoice) {
    final hasDiscount = invoice.discount > 0;

    final rows = <pw.Widget>[];

    if (hasDiscount) {
      rows.add(_totalRow('الإجمالي', _formatNum(invoice.subtotal > 0 ? invoice.subtotal : invoice.total + invoice.discount)));
      rows.add(_totalRow('الخصم', _formatNum(invoice.discount)));
      rows.add(_totalRow('الإجمالي بعد الخصم', _formatNum(invoice.total)));
    } else {
      rows.add(_totalRow('الإجمالي', _formatNum(invoice.total)));
    }

    if (invoice.paidAmount > 0) {
      rows.add(_totalRow('المدفوع', _formatNum(invoice.paidAmount)));
    }
    if (invoice.remainingAmount > 0) {
      rows.add(_totalRow('المتبقي', _formatNum(invoice.remainingAmount)));
    }

    return pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        // Right side (RTL): Website/info
        pw.Expanded(
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.SizedBox(height: 8),
              pw.Text(
                'longtimelt.com',
                style: pw.TextStyle(
                  font: _cairoBold,
                  fontSize: 12,
                  fontWeight: pw.FontWeight.bold,
                  color: _themeColor,
                ),
              ),
            ],
          ),
        ),
        // Left side (RTL): Totals
        pw.Container(
          width: 220,
          child: pw.Column(
            children: rows,
          ),
        ),
      ],
    );
  }

  static pw.Widget _totalRow(String label, String amount) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(vertical: 5),
      decoration: const pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: _black, width: 1.5)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(font: _cairoBold, fontSize: 13, fontWeight: pw.FontWeight.bold),
            textDirection: pw.TextDirection.rtl,
          ),
          pw.Text(
            amount,
            style: pw.TextStyle(font: _cairoBold, fontSize: 13, fontWeight: pw.FontWeight.bold),
            textDirection: pw.TextDirection.rtl,
          ),
        ],
      ),
    );
  }

  /// Notes section
  static pw.Widget _buildNotes(String notes) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: _themeColor, width: 1.5),
        borderRadius: pw.BorderRadius.circular(4),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            'ملاحظات:',
            style: pw.TextStyle(
              font: _cairoBold,
              fontSize: 11,
              fontWeight: pw.FontWeight.bold,
              color: _themeColor,
            ),
            textDirection: pw.TextDirection.rtl,
          ),
          pw.SizedBox(height: 4),
          pw.Text(
            notes,
            style: pw.TextStyle(font: _cairoRegular, fontSize: 12, color: _grey),
            textDirection: pw.TextDirection.rtl,
          ),
        ],
      ),
    );
  }

  /// Generate PDF and share it
  static Future<void> shareInvoice(Invoice invoice) async {
    final pdfBytes = await generatePdf(invoice);

    final dir = await getTemporaryDirectory();
    // Use safe filename (no Arabic chars) to avoid PathNotFoundException on some devices
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
