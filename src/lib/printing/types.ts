/**
 * Printing Types
 * أنواع TypeScript لنظام الطباعة
 */

import type { ReceiptSize } from './config';

// ============ Print Results ============

export interface PrintResult {
    success: boolean;
    message?: string;
    error?: string;
}

// ============ Barcode Label ============

export interface BarcodeLabelData {
    productName: string;
    barcode: string;
    price?: number;
    currency?: string;
    copies?: number;
}

export interface BarcodeLabelOptions {
    showPrice?: boolean;
}

// ============ Invoice Receipt ============

export interface InvoiceItem {
    name: string;
    quantity: number;
    price: number;
    total: number;
    unitsPerCarton?: number;
    cartons?: number; // عدد الكراتين
    individualQty?: number; // العدد الفردي
    productCode?: string; // كود المنتج
}

export interface InvoiceReceiptData {
    invoiceNumber: string;
    date: string;
    customerName?: string;
    items: InvoiceItem[];
    subtotal: number;
    discount?: number;
    tax?: number;
    total: number;
    paidAmount?: number;
    change?: number;
    paymentMethod?: string;
    previousBalance?: number; // الرصيد السابق
    currentBalance?: number; // الرصيد الحالي
    salesRepName?: string; // اسم المندوب
    isReturn?: boolean; // فاتورة مرتجعة
}

export interface InvoiceReceiptOptions {
    storeName?: string;
    storeAddress?: string;
    storePhone?: string;
    storeLogo?: string; // شعار المتجر (base64 أو URL)
    currency?: string;
    footerText?: string;
    receiptSize?: ReceiptSize;
    showQRCode?: boolean; // عرض QR code
}

// ============ Print Settings ============

export interface PrintSettings {
    receiptSize: ReceiptSize;
}
