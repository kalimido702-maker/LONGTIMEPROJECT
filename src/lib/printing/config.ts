/**
 * Printing Configuration
 * ثوابت وإعدادات الطباعة
 * يقرأ الإعدادات من localStorage إن وجدت
 */

import { getAdvancedPrintSettings, type PrintSettings, type ReceiptSettings, type LabelSettings } from './printSettings';

// ============ Receipt Sizes ============
export type ReceiptSize = '80mm' | '58mm';

// ============ Utility Functions ============

function getSettings(): PrintSettings {
    return getAdvancedPrintSettings();
}

function getReceiptSettings(size: ReceiptSize): ReceiptSettings {
    const settings = getSettings();
    return size === '80mm' ? settings.receipt80mm : settings.receipt58mm;
}

function getLabelSettings(): LabelSettings {
    return getSettings().label;
}

// ============ CSS Generators ============

/**
 * توليد CSS للباركود
 */
export function getLabelCSS(): string {
    const { fonts, layout } = getLabelSettings();

    return `
    @page {
      size: ${layout.widthInch}in ${layout.heightInch}in;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${layout.widthInch}in;
      height: ${layout.heightInch}in;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Cairo', 'Arial', 'Tahoma', sans-serif;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: ${layout.widthInch}in;
      height: ${layout.heightInch}in;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: ${layout.padding}mm;
      page-break-after: always;
      text-align: center;
      overflow: hidden;
    }
    .product-name {
      font-size: ${fonts.productNameSize}px;
      font-weight: ${fonts.productNameWeight};
      margin-bottom: 1mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
      line-height: 1.2;
    }
    .barcode {
      width: 100%;
      max-width: 30mm;
      height: ${layout.barcodeHeight}px;
    }
    .barcode-number {
      font-size: ${fonts.barcodeNumberSize}px;
      font-family: 'Courier New', monospace;
      font-weight: ${fonts.barcodeNumberWeight};
      margin-top: 0.5mm;
      letter-spacing: 0.5px;
    }
    .price {
      font-size: ${fonts.priceSize}px;
      font-weight: ${fonts.priceWeight};
      margin-top: 1mm;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

/**
 * توليد CSS للفاتورة حسب الحجم
 */
export function getReceiptCSS(size: ReceiptSize = '80mm'): string {
    const { fonts, layout } = getReceiptSettings(size);
    const widthMm = layout.width;

    return `
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${widthMm}mm;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Cairo', 'Arial', 'Tahoma', sans-serif;
      direction: rtl;
      font-size: ${fonts.bodySize}px;
      font-weight: ${fonts.bodyWeight};
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      display: flex;
      justify-content: center;
      min-height: 100%;
    }
    .receipt {
      width: ${widthMm}mm;
      padding: ${layout.padding}mm;
    }
    .header {
      text-align: center;
      margin-bottom: ${layout.headerMargin}mm;
    }
    .store-name {
      font-size: ${fonts.headerSize}px;
      font-weight: ${fonts.headerWeight};
      margin-bottom: 1mm;
    }
    .store-info {
      font-size: ${fonts.storeInfoSize}px;
      font-weight: ${fonts.storeInfoWeight};
    }
    .divider {
      border-top: 1px dashed #000;
      margin: ${layout.dividerMargin}mm 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: ${layout.infoRowMargin}mm;
      font-size: ${fonts.infoRowSize}px;
    }
    .info-row span:first-child {
      font-weight: 700;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: ${layout.dividerMargin}mm 0;
      table-layout: fixed;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      padding: ${layout.tableCellPadding}mm ${layout.tableCellPadding * 0.5}mm;
      text-align: right;
      font-size: ${fonts.tableSize}px;
      font-weight: 700;
    }
    .items-table td {
      padding: ${layout.tableCellPadding}mm ${layout.tableCellPadding * 0.5}mm;
      font-size: ${fonts.tableSize}px;
      font-weight: ${fonts.tableWeight};
      border-bottom: 1px dotted #000;
      vertical-align: top;
      word-wrap: break-word;
    }
    .items-table th:nth-child(1),
    .items-table td:nth-child(1) {
      width: 40%;
    }
    .items-table th:nth-child(2),
    .items-table td:nth-child(2) {
      width: 15%;
      text-align: center;
    }
    .items-table th:nth-child(3),
    .items-table td:nth-child(3) {
      width: 22%;
      text-align: left;
    }
    .items-table th:nth-child(4),
    .items-table td:nth-child(4) {
      width: 23%;
      text-align: left;
    }
    .totals {
      margin-top: ${layout.dividerMargin}mm;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: ${layout.totalRowMargin}mm;
      font-size: ${fonts.totalRowSize}px;
      font-weight: ${fonts.totalRowWeight};
    }
    .total-row.final {
      font-weight: ${fonts.finalTotalWeight};
      font-size: ${fonts.finalTotalSize}px;
      border-top: 1px solid #000;
      padding-top: 1mm;
      margin-top: 1mm;
    }
    .footer {
      text-align: center;
      margin-top: ${layout.footerMargin}mm;
      font-size: ${fonts.footerSize}px;
      font-weight: ${fonts.footerWeight};
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

// Re-export for backward compatibility
export { getAdvancedPrintSettings, saveAdvancedPrintSettings, resetPrintSettings } from './printSettings';
export type { PrintSettings, ReceiptSettings, LabelSettings } from './printSettings';

// Legacy exports
export const RECEIPT_SIZES = {
    '80mm': { widthMm: 68, name: '80 ملم' },
    '58mm': { widthMm: 48, name: '58 ملم' },
} as const;

export const LABEL_SIZE = {
    widthInch: 1.36,
    heightInch: 0.98,
    widthMm: 34.544,
    heightMm: 24.892,
} as const;

export const PRINT_STYLES = {
    label: getLabelCSS(),
    receipt: getReceiptCSS('80mm'),
    receipt58: getReceiptCSS('58mm'),
};
