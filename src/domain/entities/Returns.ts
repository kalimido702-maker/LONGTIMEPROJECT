export interface SalesReturn {
  id: string;
  originalInvoiceId?: string;
  customerId?: string;
  customerName?: string;
  items: SalesReturnItem[];
  subtotal: number;
  tax: number;
  total: number;
  reason: string;
  userId: string;
  userName: string;
  createdAt: string;
  refundMethod: "cash" | "credit" | "balance";
  refundStatus: "pending" | "completed" | "rejected";
  deliveryStatus?: "pending" | "delivered" | "cancelled";
  shiftId?: string;
}

export interface SalesReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  reason?: string;
}

export interface PurchaseReturn {
  id: string;
  originalPurchaseId: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseReturnItem[];
  subtotal: number;
  tax: number;
  total: number;
  reason: string;
  userId: string;
  userName: string;
  createdAt: string;
  refundStatus: "pending" | "completed" | "rejected";
  shiftId?: string;
}

export interface PurchaseReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  reason?: string;
}
