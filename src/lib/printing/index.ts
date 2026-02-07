/**
 * Printing Module
 * تصدير موحد لجميع وظائف الطباعة
 */

// Types
export type {
    PrintResult,
    BarcodeLabelData,
    BarcodeLabelOptions,
    InvoiceItem,
    InvoiceReceiptData,
    InvoiceReceiptOptions,
} from './types';

// Print Settings Types
export type {
    PrintSettings,
    ReceiptSettings,
    ReceiptFontSettings,
    ReceiptLayoutSettings,
    LabelSettings,
    LabelFontSettings,
    LabelLayoutSettings,
} from './printSettings';

// Print Settings Functions
export {
    getAdvancedPrintSettings,
    saveAdvancedPrintSettings,
    resetPrintSettings,
    DEFAULT_PRINT_SETTINGS,
    DEFAULT_RECEIPT_80MM,
    DEFAULT_RECEIPT_58MM,
    DEFAULT_LABEL,
} from './printSettings';

// Config
export type { ReceiptSize } from './config';
export { LABEL_SIZE, RECEIPT_SIZES, getLabelCSS, getReceiptCSS, PRINT_STYLES } from './config';

// Service
export {
    printBarcodeLabel,
    printBarcodeLabels,
    printInvoiceReceipt,
    getPrintSettings,
    savePrintSettings,
    printerService,
} from './printerService';

// Default export
import { printerService as _printerService } from './printerService';
export default _printerService;
