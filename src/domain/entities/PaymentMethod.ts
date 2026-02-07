export interface PaymentMethod {
  id: string;
  name: string;
  type: "cash" | "wallet" | "visa" | "bank_transfer" | "credit" | "other";
  isActive: boolean;
  createdAt: string;
}
