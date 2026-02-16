/**
 * PDF Service
 * خدمة توليد PDF للفواتير
 */

import type { InvoiceReceiptData, InvoiceReceiptOptions } from './types';

export interface PDFResult {
  success: boolean;
  filename?: string;
  blob?: Blob;
  error?: string;
}

/**
 * Generate PDF-ready HTML for invoice
 * Template matches client specification with logo, cartons, QR code, and balances
 */
function generatePDFHTML(data: InvoiceReceiptData, options: InvoiceReceiptOptions): string {
  const {
    invoiceNumber,
    date,
    customerName,
    items,
    subtotal,
    discount = 0,
    tax = 0,
    total,
    paidAmount,
    previousBalance = 0,
    currentBalance,
    salesRepName,
    isReturn = false,
  } = data;

  const {
    storeName = 'المتجر',
    storeAddress,
    storePhone,
    storeLogo,
    currency = 'EGP',
    footerText = 'شكراً لتعاملكم معنا',
    showQRCode = true,
  } = options;

  // Calculate current balance if not provided
  const calcCurrentBalance = currentBalance !== undefined
    ? Number(currentBalance)
    : Number(previousBalance || 0) + Number(total || 0) - Number(paidAmount || 0);

  // Format invoice number to 6 digits
  const formattedInvoiceNumber = invoiceNumber.toString().padStart(6, '0');

  // Generate QR code data (invoice info for scanning)
  const qrData = JSON.stringify({
    inv: formattedInvoiceNumber,
    date: date,
    total: total,
    customer: customerName,
  });

  // Generate items table rows with cartons/individual split
  const itemsRows = items.map((item, index) => {
    const cartons = item.cartons || Math.floor(item.quantity / (item.unitsPerCarton || 1));
    const individual = item.individualQty || (item.quantity % (item.unitsPerCarton || 1));

    return `
    <tr>
      <td class="td-center">${index + 1}</td>
      <td class="td-right">${item.name}</td>
      <td class="td-center">${item.productCode || '-'}</td>
      <td class="td-center">${item.quantity}</td>
      <td class="td-center">${item.unitsPerCarton || '-'}</td>
      <td class="td-left">${Math.round(item.price)}</td>
      <td class="td-left">${Math.round(item.total)}</td>
      <td class="td-center">${cartons || '-'}</td>
      <td class="td-center">${individual || '-'}</td>
    </tr>
  `}).join('');

  // Invoice type label
  const invoiceTypeLabel = isReturn ? 'فاتورة مرتجعة' : 'فاتورة';

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${invoiceTypeLabel} ${formattedInvoiceNumber} - ${customerName || 'عميل'}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Arial', 'Tahoma', sans-serif;
          background: white;
          color: #000;
          padding: 15px;
          direction: rtl;
          font-size: 12px;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border: 2px solid #1e40af;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px;
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          color: white;
        }
        .logo-section {
          width: 100px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-section img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .logo-placeholder {
          width: 80px;
          height: 50px;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          font-size: 10px;
        }
        .store-info {
          text-align: center;
          flex: 1;
        }
        .store-name {
          font-size: 22px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .store-subtitle {
          font-size: 14px;
          opacity: 0.9;
        }
        .invoice-type-badge {
          background: ${isReturn ? '#dc2626' : '#16a34a'};
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: bold;
          font-size: 14px;
        }
        .meta-section {
          display: flex;
          justify-content: space-between;
          padding: 10px 15px;
          background: #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
        }
        .meta-item {
          display: flex;
          gap: 8px;
        }
        .meta-label {
          color: #64748b;
          font-size: 11px;
        }
        .meta-value {
          font-weight: bold;
          color: #1e293b;
        }
        .customer-section {
          display: flex;
          justify-content: space-between;
          padding: 10px 15px;
          background: #fff;
          border-bottom: 2px solid #1e40af;
        }
        .customer-info {
          display: flex;
          gap: 20px;
        }
        .customer-label {
          color: #64748b;
          font-size: 11px;
        }
        .customer-value {
          font-weight: bold;
          font-size: 14px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
        }
        .items-table th {
          background: #1e40af;
          color: white;
          padding: 8px 4px;
          text-align: center;
          font-size: 11px;
          font-weight: bold;
          border: 1px solid #1e40af;
        }
        .items-table td {
          padding: 6px 4px;
          border: 1px solid #e2e8f0;
          font-size: 11px;
        }
        .td-center { text-align: center; }
        .td-right { text-align: right; }
        .td-left { text-align: left; }
        .items-table tr:nth-child(even) {
          background: #f8fafc;
        }
        .footer-section {
          display: flex;
          justify-content: space-between;
          padding: 15px;
          background: #f1f5f9;
          border-top: 2px solid #1e40af;
        }
        .qr-section {
          width: 80px;
          height: 80px;
          background: white;
          border: 1px solid #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 5px;
        }
        .qr-section img {
          max-width: 100%;
          max-height: 100%;
        }
        .summary-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 20px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px dotted #ccc;
        }
        .summary-row.total {
          font-size: 16px;
          font-weight: bold;
          color: #1e40af;
          border-bottom: 2px solid #1e40af;
          padding: 8px 0;
        }
        .summary-row.balance {
          background: #fef2f2;
          padding: 6px 8px;
          border-radius: 4px;
          margin-top: 4px;
        }
        .summary-row.balance.current {
          background: #fef2f2;
          color: #dc2626;
          font-weight: bold;
        }
        .summary-row.balance.previous {
          background: #f0fdf4;
          color: #16a34a;
        }
        .summary-label {
          color: #64748b;
        }
        .summary-value {
          font-weight: bold;
        }
        .footer-message {
          text-align: center;
          padding: 10px;
          background: #1e40af;
          color: white;
          font-size: 12px;
        }
        @media print {
          body { padding: 0; }
          .invoice-container { border: 2px solid #000; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <!-- Header with Logo -->
        <div class="header">
          <div class="logo-section">
            ${storeLogo ? `<img src="${storeLogo}" alt="Logo">` : '<div class="logo-placeholder">الشعار</div>'}
          </div>
          <div class="store-info">
            <div class="store-name">${storeName}</div>
            ${storeAddress ? `<div class="store-subtitle">${storeAddress}</div>` : ''}
            ${storePhone ? `<div class="store-subtitle">هاتف: ${storePhone}</div>` : ''}
          </div>
          <div class="invoice-type-badge">${invoiceTypeLabel}</div>
        </div>

        <!-- Invoice Meta -->
        <div class="meta-section">
          <div class="meta-item">
            <span class="meta-label">رقم الفاتورة:</span>
            <span class="meta-value">${formattedInvoiceNumber}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">التاريخ:</span>
            <span class="meta-value">${date}</span>
          </div>
        </div>

        <!-- Customer Info -->
        <div class="customer-section">
          <div class="customer-info">
            <div>
              <div class="customer-label">السادة/</div>
              <div class="customer-value">${customerName || 'عميل نقدي'}</div>
            </div>
            ${salesRepName ? `
            <div>
              <div class="customer-label">المندوب</div>
              <div class="customer-value">${salesRepName}</div>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 30px;">م</th>
              <th>اسم الصنف</th>
              <th style="width: 60px;">الكود</th>
              <th style="width: 50px;">الكمية</th>
              <th style="width: 50px;">الفئة</th>
              <th style="width: 60px;">السعر</th>
              <th style="width: 70px;">الإجمالي</th>
              <th style="width: 50px;">كراتين</th>
              <th style="width: 50px;">فردي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Footer with QR and Summary -->
        <div class="footer-section">
          ${showQRCode ? `
          <div class="qr-section">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(qrData)}" alt="QR Code">
          </div>
          ` : ''}
          
          <div class="summary-section">
            <div class="summary-row">
              <span class="summary-label">المجموع:</span>
              <span class="summary-value">${Math.round(Number(subtotal) || 0)} ${currency}</span>
            </div>
            ${Number(discount) > 0 ? `
            <div class="summary-row">
              <span class="summary-label">الخصم:</span>
              <span class="summary-value" style="color: #dc2626;">-${Math.round(Number(discount) || 0)} ${currency}</span>
            </div>
            ` : ''}
            ${Number(tax) > 0 ? `
            <div class="summary-row">
              <span class="summary-label">الضريبة:</span>
              <span class="summary-value">${Math.round(Number(tax) || 0)} ${currency}</span>
            </div>
            ` : ''}
            <div class="summary-row total">
              <span>الإجمالي:</span>
              <span>${Math.round(Number(total) || 0)} ${currency}</span>
            </div>
            ${previousBalance !== undefined && previousBalance !== 0 ? `
            <div class="summary-row balance previous">
              <span class="summary-label">الرصيد السابق:</span>
              <span class="summary-value">${Math.round(Number(previousBalance) || 0)} ${currency}</span>
            </div>
            ` : ''}
            <div class="summary-row balance current">
              <span class="summary-label">الرصيد الحالي:</span>
              <span class="summary-value">${Math.round(Number(calcCurrentBalance) || 0)} ${currency}</span>
            </div>
          </div>
        </div>

        <div class="footer-message">${footerText}</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Open invoice as PDF in new window for download/print
 */
export async function downloadInvoicePDF(
  data: InvoiceReceiptData,
  options: InvoiceReceiptOptions = {}
): Promise<PDFResult> {
  try {
    const html = generatePDFHTML(data, options);
    const filename = `فاتورة_${data.invoiceNumber}_${data.customerName || 'عميل'}.pdf`;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return {
        success: false,
        error: 'تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.'
      };
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load then trigger print
    printWindow.onload = () => {
      printWindow.print();
    };

    // Also trigger print after a small delay as fallback
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (e) {
        // Window might be closed
      }
    }, 500);

    return {
      success: true,
      filename
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ أثناء توليد PDF'
    };
  }
}

/**
 * Save invoice as downloadable HTML file (can be opened and printed as PDF)
 */
export function saveInvoiceAsHTML(
  data: InvoiceReceiptData,
  options: InvoiceReceiptOptions = {}
): PDFResult {
  try {
    const html = generatePDFHTML(data, options);
    const filename = `فاتورة_${data.invoiceNumber}_${data.customerName || 'عميل'}.html`;

    // Create blob and download
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      filename,
      blob
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ أثناء حفظ الملف'
    };
  }
}

export const pdfService = {
  downloadInvoicePDF,
  saveInvoiceAsHTML,
  generatePDFHTML
};

export default pdfService;
