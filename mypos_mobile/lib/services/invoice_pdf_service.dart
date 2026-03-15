import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/invoice.dart';

/// Generates invoice PDF using the `pdf` package widget system with embedded
/// Cairo Arabic fonts.  Layout matches the desktop HTML template.
class InvoicePdfService {
  static pw.Font? _cairoRegular;
  static pw.Font? _cairoBold;
  static pw.MemoryImage? _logoImage;

  static const _teal = PdfColor.fromInt(0xFF2d8a9e);
  static const _black = PdfColors.black;
  static const _white = PdfColors.white;
  static const _greyLight = PdfColor.fromInt(0xFFAAAAAA);

  // ── Load assets (cached) ──────────────────────────────────────────────

  static Future<void> _loadAssets() async {
    if (_cairoRegular != null) return;
    final regularData = await rootBundle.load('assets/fonts/Cairo-Regular.ttf');
    final boldData = await rootBundle.load('assets/fonts/Cairo-Bold.ttf');
    _cairoRegular = pw.Font.ttf(regularData);
    _cairoBold = pw.Font.ttf(boldData);
    try {
      final logoData = await rootBundle.load('assets/images/logo.png');
      _logoImage = pw.MemoryImage(logoData.buffer.asUint8List());
    } catch (_) {
      _logoImage = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  static pw.TextStyle _ts({
    double size = 12,
    bool bold = false,
    PdfColor color = PdfColors.black,
  }) =>
      pw.TextStyle(
        font: bold ? _cairoBold : _cairoRegular,
        fontBold: _cairoBold,
        fontNormal: _cairoRegular,
        fontSize: size,
        fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
        color: color,
      );

  static String _fmt(double n, {int maxDec = 0}) {
    // Force no decimals as requested: "عايز الغي الكسور منها"
    final str = n.toStringAsFixed(maxDec);
    return str.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]},',
    );
  }

  // ── Build PDF ─────────────────────────────────────────────────────────

  static Future<Uint8List> generatePdf(Invoice invoice) async {
    await _loadAssets();

    final pdf = pw.Document();
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

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        textDirection: pw.TextDirection.rtl,
        margin: const pw.EdgeInsets.fromLTRB(34, 28, 34, 28),
        build: (ctx) => [
          // ── HEADER ──────────────────────────────────────────────
          _buildHeader(invoice, invoiceNum, dateStr, isReturn),
          pw.SizedBox(height: 12),

          // ── ITEMS TABLE ─────────────────────────────────────────
          _buildItemsTable(invoice),
          pw.SizedBox(height: 12),

          // ── FOOTER (totals + website) ───────────────────────────
          _buildFooter(invoice),

          // ── NOTES ───────────────────────────────────────────────
          if (invoice.notes != null && invoice.notes!.isNotEmpty) ...[
            pw.SizedBox(height: 10),
            _buildNotes(invoice.notes!),
          ],
        ],
      ),
    );

    return pdf.save();
  }

  // ── HEADER ──────────────────────────────────────────────────────────

  static pw.Widget _buildHeader(
      Invoice invoice, String invoiceNum, String dateStr, bool isReturn) {
    return pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        // Right side (in RTL): Company name + invoice type + customer
        pw.Expanded(
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                'لونج تايم للصناعات الكهربائية',
                style: _ts(size: 20, bold: true),
                textDirection: pw.TextDirection.rtl,
              ),
              pw.SizedBox(height: 4),
              // Invoice type bar
              pw.Container(
                width: double.infinity,
                padding:
                    const pw.EdgeInsets.symmetric(horizontal: 14, vertical: 3),
                color: _teal,
                child: pw.Text(
                  isReturn ? 'مرتجع من:' : 'فاتورة إلى:',
                  style: _ts(size: 11, bold: true, color: _white),
                  textDirection: pw.TextDirection.rtl,
                ),
              ),
              pw.SizedBox(height: 6),
              pw.Text(
                'السادة / ${invoice.customerName ?? ''}',
                style: _ts(size: 15, bold: true),
                textDirection: pw.TextDirection.rtl,
              ),
            ],
          ),
        ),

        pw.SizedBox(width: 20),

        // Left side (in RTL): Logo + Meta table
        pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            if (_logoImage != null)
              pw.Image(_logoImage!, width: 110, height: 60,
                  fit: pw.BoxFit.contain),
            if (_logoImage != null) pw.SizedBox(height: 8),
            // Meta table: invoice number + date
            _buildMetaTable(invoiceNum, dateStr),
          ],
        ),
      ],
    );
  }

  static pw.Widget _buildMetaTable(String invoiceNum, String dateStr) {
    return pw.Table(
      border: null,
      columnWidths: {
        0: const pw.FixedColumnWidth(80),
        1: const pw.FixedColumnWidth(80),
      },
      children: [
        // Header row
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: _teal),
          children: [
            pw.Padding(
              padding: const pw.EdgeInsets.all(4),
              child: pw.Text('رقم الفاتورة',
                  style: _ts(size: 9, bold: true, color: _white),
                  textAlign: pw.TextAlign.center,
                  textDirection: pw.TextDirection.rtl),
            ),
            pw.Padding(
              padding: const pw.EdgeInsets.all(4),
              child: pw.Text('التاريخ',
                  style: _ts(size: 9, bold: true, color: _white),
                  textAlign: pw.TextAlign.center,
                  textDirection: pw.TextDirection.rtl),
            ),
          ],
        ),
        // Data row
        pw.TableRow(
          decoration: const pw.BoxDecoration(
            border: pw.Border(
              bottom: pw.BorderSide(color: _teal, width: 3),
            ),
          ),
          children: [
            pw.Padding(
              padding: const pw.EdgeInsets.all(4),
              child: pw.Text(invoiceNum,
                  style: _ts(size: 11, bold: true),
                  textAlign: pw.TextAlign.center,
                  textDirection: pw.TextDirection.rtl),
            ),
            pw.Padding(
              padding: const pw.EdgeInsets.all(4),
              child: pw.Text(dateStr,
                  style: _ts(size: 11, bold: true),
                  textAlign: pw.TextAlign.center,
                  textDirection: pw.TextDirection.rtl),
            ),
          ],
        ),
      ],
    );
  }

  // ── ITEMS TABLE ────────────────────────────────────────────────────────

  static pw.Widget _buildItemsTable(Invoice invoice) {
    // Check if any item has unitsPerCarton
    final hasCarton = invoice.items.any((it) => it.unitsPerCarton != null && it.unitsPerCarton! > 0);

    // RTL order: The array passed to pw.Table is rendered from Right-to-Left. 
    // Thus index 0 is on the FAR RIGHT visuals.
    final headers = ['م', 'اسم الصنف', 'الكمية', 'الوحدة', 'الفئة', 'الإجمالي'];
    final colWidths = <int, pw.TableColumnWidth>{
      0: const pw.FlexColumnWidth(0.7),  // م
      1: const pw.FlexColumnWidth(4.5),  // اسم الصنف
      2: const pw.FlexColumnWidth(1.2),  // الكمية
      3: const pw.FlexColumnWidth(1.4),  // الوحدة
      4: const pw.FlexColumnWidth(1.8),  // الفئة
      5: const pw.FlexColumnWidth(1.8),  // الإجمالي
    };

    if (hasCarton) {
      // Add empty gap column and carton column to the left (end of array)
      headers.addAll(['', 'العدد في ك']);
      colWidths[6] = const pw.FixedColumnWidth(8); // Gap
      colWidths[7] = const pw.FlexColumnWidth(1.2); // Carton
    }

    // Build the table manually to allow gap column to be borderless
    return pw.Table(
      columnWidths: colWidths,
      children: [
        // Header Row
        pw.TableRow(
          children: List.generate(headers.length, (i) {
            if (i == 6 && hasCarton) return pw.SizedBox(width: 8); // Gap

            pw.BorderSide rightBorder = pw.BorderSide.none;
            pw.BorderSide leftBorder = const pw.BorderSide(color: _greyLight, width: 0.5);

            // Far RIGHT edge of main table
            if (i == 0) rightBorder = const pw.BorderSide(color: _teal, width: 1.5);
            // Far LEFT edge of main table
            if (i == 5) leftBorder = const pw.BorderSide(color: _teal, width: 1.5);
            
            // Edges for Carton standalone piece
            if (i == 7 && hasCarton) {
              rightBorder = const pw.BorderSide(color: _teal, width: 1.5);
              leftBorder = const pw.BorderSide(color: _teal, width: 1.5);
            }

            return pw.Container(
              height: 28,
              alignment: pw.Alignment.center,
              decoration: pw.BoxDecoration(
                color: _teal,
                border: pw.Border(
                  top: const pw.BorderSide(color: _teal, width: 1.5),
                  bottom: const pw.BorderSide(color: _teal, width: 1.5),
                  left: leftBorder,
                  right: rightBorder,
                ),
              ),
              child: pw.Text(
                headers[i],
                style: _ts(size: (i == 7 && hasCarton) ? 9 : 11, bold: true, color: _white),
                textAlign: pw.TextAlign.center,
                // Avoid redundant TextDirection inside text, table handles it
              ),
            );
          }),
        ),
        // Data Rows
        ...List.generate(invoice.items.length, (rowIndex) {
          final item = invoice.items[rowIndex];
          final isLastRow = rowIndex == invoice.items.length - 1;

          final cells = [
            '${rowIndex + 1}',
            item.name,
            _fmt(item.quantity),
            item.unitName ?? 'قطعة',
            _fmt(item.price),
            _fmt(item.total),
          ];

          if (hasCarton) {
            cells.add(''); // Gap
            cells.add(item.unitsPerCarton != null && item.unitsPerCarton! > 0
                ? _fmt(item.unitsPerCarton!.toDouble())
                : '');
          }

          return pw.TableRow(
            children: List.generate(cells.length, (i) {
              if (i == 6 && hasCarton) return pw.SizedBox(width: 8); // Gap

              pw.BorderSide rightBorder = pw.BorderSide.none;
              pw.BorderSide leftBorder = const pw.BorderSide(color: _greyLight, width: 0.5);

              if (i == 0) rightBorder = const pw.BorderSide(color: _teal, width: 1.5);
              if (i == 5) leftBorder = const pw.BorderSide(color: _teal, width: 1.5);
              
              if (i == 7 && hasCarton) {
                rightBorder = const pw.BorderSide(color: _teal, width: 1.5);
                leftBorder = const pw.BorderSide(color: _teal, width: 1.5);
              }
              
              final bottomBorder = isLastRow ? const pw.BorderSide(color: _teal, width: 1.5) : const pw.BorderSide(color: _greyLight, width: 0.5);

              return pw.Container(
                constraints: const pw.BoxConstraints(minHeight: 28),
                padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 2),
                alignment: pw.Alignment.center,
                decoration: pw.BoxDecoration(
                  border: pw.Border(
                    bottom: bottomBorder,
                    left: leftBorder,
                    right: rightBorder,
                  ),
                ),
                child: pw.Text(
                  cells[i],
                  style: _ts(size: 11, bold: false),
                  textAlign: pw.TextAlign.center,
                  textDirection: pw.TextDirection.rtl,
                ),
              );
            }),
          );
        }),
      ],
    );
  }

  // ── FOOTER ─────────────────────────────────────────────────────────────

  static pw.Widget _buildFooter(Invoice invoice) {
    final totalRows = <pw.Widget>[];
    final hasDiscount = invoice.discount > 0;

    if (hasDiscount) {
      final subtotal = invoice.subtotal > 0
          ? invoice.subtotal
          : invoice.total + invoice.discount;
      totalRows.add(_totalRow('الإجمالي', _fmt(subtotal)));
      totalRows.add(_totalRow('الخصم', _fmt(invoice.discount)));
      totalRows.add(_totalRow('الإجمالي بعد الخصم', _fmt(invoice.total)));
    } else {
      totalRows.add(_totalRow('الإجمالي', _fmt(invoice.total)));
    }

    if (invoice.previousBalance != null) {
      totalRows.add(_totalRow('الرصيد السابق', _fmt(invoice.previousBalance!)));
    }
    if (invoice.currentBalance != null) {
      totalRows.add(_totalRow('الرصيد الحالي', _fmt(invoice.currentBalance!)));
    }

    return pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        // Totals block (right in RTL)
        pw.SizedBox(
          width: 200,
          child: pw.Column(children: totalRows),
        ),
        pw.Spacer(),
        // Website (left in RTL)
        pw.Text(
          'longtimelt.com',
          style: _ts(size: 12, bold: true, color: _teal),
        ),
      ],
    );
  }

  static pw.Widget _totalRow(String label, String amount) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(vertical: 4),
      decoration: const pw.BoxDecoration(
        border:
            pw.Border(bottom: pw.BorderSide(color: _black, width: 1.5)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label,
              style: _ts(size: 12, bold: true),
              textDirection: pw.TextDirection.rtl),
          pw.Text(amount,
              style: _ts(size: 12, bold: true),
              textDirection: pw.TextDirection.rtl),
        ],
      ),
    );
  }

  // ── NOTES ──────────────────────────────────────────────────────────────

  static pw.Widget _buildNotes(String notes) {
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.all(8),
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: _teal, width: 1),
        borderRadius: pw.BorderRadius.circular(3),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('ملاحظات:',
              style: _ts(size: 11, bold: true, color: _teal),
              textDirection: pw.TextDirection.rtl),
          pw.SizedBox(height: 3),
          pw.Text(notes,
              style: _ts(size: 11),
              textDirection: pw.TextDirection.rtl),
        ],
      ),
    );
  }

  // ── Share ───────────────────────────────────────────────────────────────

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
