/**
 * Printer Service
 * خدمة الطباعة باستخدام window.print
 */

import type {
  PrintResult,
  BarcodeLabelData,
  BarcodeLabelOptions,
  InvoiceReceiptData,
  InvoiceReceiptOptions,
} from './types';
import { getLabelCSS, getReceiptCSS, type ReceiptSize } from './config';

/**
 * الحصول على إعدادات الطباعة من localStorage
 */
export function getPrintSettings(): { receiptSize: ReceiptSize } {
  try {
    const settings = localStorage.getItem('printSettings');
    if (settings) {
      return JSON.parse(settings);
    }
  } catch (e) {
    console.error('Error reading print settings:', e);
  }
  return { receiptSize: '80mm' };
}

/**
 * حفظ إعدادات الطباعة في localStorage
 */
export function savePrintSettings(settings: { receiptSize: ReceiptSize }): void {
  try {
    localStorage.setItem('printSettings', JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving print settings:', e);
  }
}

/**
 * طباعة ملصقات باركود
 */
export async function printBarcodeLabels(
  labels: BarcodeLabelData[],
  options: BarcodeLabelOptions = {}
): Promise<PrintResult> {
  let allLabelsHTML = '';
  let barcodeIndex = 0;
  const barcodes: { index: number; value: string }[] = [];

  for (const label of labels) {
    const copies = label.copies || 1;
    for (let i = 0; i < copies; i++) {
      barcodes.push({ index: barcodeIndex, value: label.barcode });
      allLabelsHTML += `
        <div class="label">
          <div class="product-name">${label.productName}</div>
          <svg class="barcode" id="barcode-${barcodeIndex}"></svg>
          <div class="barcode-number">${label.barcode}</div>
          ${options.showPrice && label.price !== undefined ? `<div class="price">${Number(label.price || 0).toFixed(2)} ${label.currency || 'EGP'}</div>` : ''}
        </div>
      `;
      barcodeIndex++;
    }
  }

  const barcodeScript = `
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>
      window.onload = function() {
        const barcodes = ${JSON.stringify(barcodes)};
        barcodes.forEach(function(b) {
          try {
            JsBarcode("#barcode-" + b.index, b.value, {
              format: "EAN13",
              width: 1.5,
              height: 20,
              displayValue: false,
              margin: 0
            });
          } catch(e) {
            try {
              JsBarcode("#barcode-" + b.index, b.value, {
                format: "CODE128",
                width: 1.5,
                height: 20,
                displayValue: false,
                margin: 0
              });
            } catch(e2) {
              console.error('Barcode error:', e2);
            }
          }
        });
        setTimeout(function() {
          window.print();
          window.close();
        }, 500);
      };
    </script>
  `;

  const printWindow = window.open('', '_blank', 'width=400,height=600');

  if (!printWindow) {
    return { success: false, error: 'تعذر فتح نافذة الطباعة' };
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>طباعة الباركود</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${getLabelCSS()}</style>
    </head>
    <body>
      ${allLabelsHTML}
      ${barcodeScript}
    </body>
    </html>
  `);
  printWindow.document.close();

  return { success: true, message: 'تم فتح نافذة الطباعة' };
}

/**
 * طباعة ملصق باركود واحد
 */
export async function printBarcodeLabel(
  data: BarcodeLabelData,
  options: BarcodeLabelOptions = {}
): Promise<PrintResult> {
  return printBarcodeLabels([data], options);
}

/**
 * توليد HTML للفاتورة
 */
function generateInvoiceHTML(data: InvoiceReceiptData, options: InvoiceReceiptOptions): string {
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
    change,
    paymentMethod,
  } = data;

  const {
    storeName = 'المتجر',
    storeAddress,
    storePhone,
    currency = 'EGP',
    footerText = 'شكراً لتعاملكم معنا',
  } = options;

  const itemsRows = items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: left;">${Number(item.price || 0).toFixed(2)}</td>
      <td style="text-align: left;">${Number(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div class="receipt">
      <div class="header">
        <div class="store-name">${storeName}</div>
        ${storeAddress ? `<div class="store-info">${storeAddress}</div>` : ''}
        ${storePhone ? `<div class="store-info">هاتف: ${storePhone}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <span>فاتورة رقم:</span>
        <span>${invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span>التاريخ:</span>
        <span>${date}</span>
      </div>
      ${customerName ? `
        <div class="info-row">
          <span>العميل:</span>
          <span>${customerName}</span>
        </div>
      ` : ''}

      <div class="divider"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th>الصنف</th>
            <th style="text-align: center;">الكمية</th>
            <th style="text-align: left;">السعر</th>
            <th style="text-align: left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="divider"></div>

      <div class="totals">
        <div class="total-row">
          <span>المجموع الفرعي:</span>
          <span>${Number(subtotal || 0).toFixed(2)} ${currency}</span>
        </div>
        ${Number(discount) > 0 ? `
          <div class="total-row">
            <span>الخصم:</span>
            <span style="color: red;">-${Number(discount || 0).toFixed(2)} ${currency}</span>
          </div>
        ` : ''}
        ${Number(tax) > 0 ? `
          <div class="total-row">
            <span>الضريبة:</span>
            <span>${Number(tax || 0).toFixed(2)} ${currency}</span>
          </div>
        ` : ''}
        <div class="total-row final">
          <span>الإجمالي:</span>
          <span>${Number(total || 0).toFixed(2)} ${currency}</span>
        </div>
        ${paymentMethod ? `
          <div class="total-row">
            <span>طريقة الدفع:</span>
            <span>${paymentMethod}</span>
          </div>
        ` : ''}
        ${paidAmount !== undefined ? `
          <div class="total-row">
            <span>المدفوع:</span>
            <span>${Number(paidAmount || 0).toFixed(2)} ${currency}</span>
          </div>
        ` : ''}
        ${change !== undefined && Number(change) > 0 ? `
          <div class="total-row">
            <span>الباقي:</span>
            <span>${Number(change || 0).toFixed(2)} ${currency}</span>
          </div>
        ` : ''}
      </div>

      <div class="divider"></div>

      <div class="footer">${footerText}</div>
    </div>
  `;
}

/**
 * طباعة فاتورة
 */
export async function printInvoiceReceipt(
  data: InvoiceReceiptData,
  options: InvoiceReceiptOptions = {}
): Promise<PrintResult> {
  // الحصول على حجم الفاتورة من الإعدادات أو من الخيارات
  const settings = getPrintSettings();
  const size = options.receiptSize || settings.receiptSize;

  const content = generateInvoiceHTML(data, options);
  const css = getReceiptCSS(size);

  const printWindow = window.open('', '_blank', 'width=400,height=600');

  if (!printWindow) {
    return { success: false, error: 'تعذر فتح نافذة الطباعة' };
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>طباعة الفاتورة</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${css}</style>
    </head>
    <body>
      ${content}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();

  return { success: true, message: 'تم فتح نافذة الطباعة' };
}

// تصدير كائن موحد للخدمة
export const printerService = {
  printBarcodeLabel,
  printBarcodeLabels,
  printInvoiceReceipt,
  getPrintSettings,
  savePrintSettings,
};

export default printerService;
