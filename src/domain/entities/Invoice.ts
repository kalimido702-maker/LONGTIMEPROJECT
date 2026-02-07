export interface InstallmentPayment {
  id: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  paidDate?: string;
}

export interface InstallmentPlan {
  numberOfInstallments: number;
  installmentAmount: number;
  interestRate: number;
  startDate: string;
  payments: InstallmentPayment[];
}

export interface Invoice {
  id: string;
  invoiceNumber?: string; // رقم الفاتورة المتسلسل (يبدأ من 113)
  customerId?: string;
  customerName?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paymentType: "cash" | "credit" | "installment";
  paymentStatus: "paid" | "partial" | "unpaid";
  paidAmount: number;
  remainingAmount: number;
  paymentMethodIds: string[];
  paymentMethodAmounts: Record<string, number>;
  userId: string;
  userName: string;
  createdAt: string;
  dueDate?: string;
  notes?: string; // ملاحظات على الفاتورة
  salesRepId?: string; // المندوب المسؤول
  shiftId?: string; // معرف الوردية
  deliveryStatus?: "not_delivered" | "shipped" | "delivered"; // حالة التسليم (لم يتم التسليم، تم الشحن، تم التسليم)
  warehouseId?: string;
  installmentPlan?: InstallmentPlan;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  unitId: string;
  unitName: string;
  conversionFactor: number;
  priceTypeId: string;
  priceTypeName: string;
  returnedQuantity?: number;
  warehouseId?: string;
  productUnitId?: string;
  selectedUnitName?: string;
  unitsPerCarton?: number; // العدد في الكرتونة
}
