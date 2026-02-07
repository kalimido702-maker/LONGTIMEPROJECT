import { InstallmentPlan } from "./Invoice";

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentType: "cash" | "credit" | "installment";
  paymentStatus: "paid" | "partial" | "unpaid";
  paidAmount: number;
  remainingAmount: number;
  userId: string;
  userName: string;
  createdAt: string;
  dueDate?: string;
  installmentPlan?: InstallmentPlan;
  shiftId?: string;
  notes?: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  total: number;
  unitId: string;
  unitName: string;
  returnedQuantity?: number;
}

export interface PurchasePayment {
  id: string;
  purchaseId: string;
  amount: number;
  paymentMethod: string;
  userId: string;
  userName: string;
  createdAt: string;
  shiftId?: string;
  notes?: string;
}
