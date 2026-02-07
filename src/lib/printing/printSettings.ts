/**
 * Print Settings Types and Defaults
 * أنواع وقيم افتراضية لإعدادات الطباعة
 */

import type { ReceiptSize } from './config';

// Re-export for convenience
export type { ReceiptSize };

// ============ Receipt Settings ============

export interface ReceiptFontSettings {
    bodySize: number;        // حجم الخط الأساسي
    bodyWeight: number;      // وزن الخط الأساسي
    headerSize: number;      // حجم اسم المتجر
    headerWeight: number;    // وزن اسم المتجر
    storeInfoSize: number;   // حجم معلومات المتجر
    storeInfoWeight: number; // وزن معلومات المتجر
    infoRowSize: number;     // حجم صفوف المعلومات
    tableSize: number;       // حجم خط الجدول
    tableWeight: number;     // وزن خط الجدول
    totalRowSize: number;    // حجم صف المجموع
    totalRowWeight: number;  // وزن صف المجموع
    finalTotalSize: number;  // حجم الإجمالي النهائي
    finalTotalWeight: number; // وزن الإجمالي النهائي
    footerSize: number;      // حجم الفوتر
    footerWeight: number;    // وزن الفوتر
}

export interface ReceiptLayoutSettings {
    width: number;             // عرض الفاتورة بالملم
    padding: number;           // الهوامش الداخلية بالملم
    headerMargin: number;      // هامش الهيدر
    dividerMargin: number;     // هامش الخط الفاصل
    infoRowMargin: number;     // هامش صفوف المعلومات
    tableCellPadding: number;  // هوامش خلايا الجدول
    totalRowMargin: number;    // هامش صف المجموع
    footerMargin: number;      // هامش الفوتر
}

export interface ReceiptSettings {
    fonts: ReceiptFontSettings;
    layout: ReceiptLayoutSettings;
}

// ============ Label Settings ============

export interface LabelFontSettings {
    productNameSize: number;
    productNameWeight: number;
    barcodeNumberSize: number;
    barcodeNumberWeight: number;
    priceSize: number;
    priceWeight: number;
}

export interface LabelLayoutSettings {
    widthInch: number;
    heightInch: number;
    padding: number;         // بالملم
    barcodeHeight: number;   // ارتفاع الباركود
}

export interface LabelSettings {
    fonts: LabelFontSettings;
    layout: LabelLayoutSettings;
}

// ============ Complete Settings ============

export interface PrintSettings {
    selectedSize: ReceiptSize;
    receipt80mm: ReceiptSettings;
    receipt58mm: ReceiptSettings;
    label: LabelSettings;
}

// ============ Default Values ============

export const DEFAULT_RECEIPT_80MM: ReceiptSettings = {
    fonts: {
        bodySize: 13,
        bodyWeight: 500,
        headerSize: 16,
        headerWeight: 700,
        storeInfoSize: 11,
        storeInfoWeight: 500,
        infoRowSize: 12,
        tableSize: 11,
        tableWeight: 500,
        totalRowSize: 12,
        totalRowWeight: 600,
        finalTotalSize: 14,
        finalTotalWeight: 700,
        footerSize: 11,
        footerWeight: 600,
    },
    layout: {
        width: 68,
        padding: 2,
        headerMargin: 2,
        dividerMargin: 2,
        infoRowMargin: 1,
        tableCellPadding: 1,
        totalRowMargin: 1,
        footerMargin: 2,
    },
};

export const DEFAULT_RECEIPT_58MM: ReceiptSettings = {
    fonts: {
        bodySize: 11,
        bodyWeight: 500,
        headerSize: 14,
        headerWeight: 700,
        storeInfoSize: 10,
        storeInfoWeight: 500,
        infoRowSize: 11,
        tableSize: 10,
        tableWeight: 500,
        totalRowSize: 11,
        totalRowWeight: 600,
        finalTotalSize: 13,
        finalTotalWeight: 700,
        footerSize: 10,
        footerWeight: 600,
    },
    layout: {
        width: 48,
        padding: 1.5,
        headerMargin: 1.5,
        dividerMargin: 1.5,
        infoRowMargin: 0.5,
        tableCellPadding: 0.5,
        totalRowMargin: 0.5,
        footerMargin: 1.5,
    },
};

export const DEFAULT_LABEL: LabelSettings = {
    fonts: {
        productNameSize: 10,
        productNameWeight: 700,
        barcodeNumberSize: 8,
        barcodeNumberWeight: 600,
        priceSize: 10,
        priceWeight: 700,
    },
    layout: {
        widthInch: 1.36,
        heightInch: 0.98,
        padding: 1,
        barcodeHeight: 20,
    },
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
    selectedSize: '80mm',
    receipt80mm: DEFAULT_RECEIPT_80MM,
    receipt58mm: DEFAULT_RECEIPT_58MM,
    label: DEFAULT_LABEL,
};

// ============ Storage Functions ============

const STORAGE_KEY = 'advancedPrintSettings';

export function getAdvancedPrintSettings(): PrintSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to ensure all fields exist
            return {
                ...DEFAULT_PRINT_SETTINGS,
                ...parsed,
                receipt80mm: { ...DEFAULT_RECEIPT_80MM, ...parsed.receipt80mm },
                receipt58mm: { ...DEFAULT_RECEIPT_58MM, ...parsed.receipt58mm },
                label: { ...DEFAULT_LABEL, ...parsed.label },
            };
        }
    } catch (e) {
        console.error('Error reading advanced print settings:', e);
    }
    return DEFAULT_PRINT_SETTINGS;
}

export function saveAdvancedPrintSettings(settings: PrintSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Error saving advanced print settings:', e);
    }
}

export function resetPrintSettings(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('Error resetting print settings:', e);
    }
}
