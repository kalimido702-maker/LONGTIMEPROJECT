export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  paymentMethod: "cash" | "card" | "wallet";
  userId: string;
  createdAt: string;
  notes?: string;
}
