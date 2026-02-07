export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  nationalId?: string;
  creditLimit: number;
  currentBalance: number;
  bonusBalance: number; // رصيد البونص (منفصل عن المدفوعات)
  previousStatement?: number; // Statement قديم
  salesRepId?: string; // المندوب المسؤول
  class?: "A" | "B" | "C"; // تصنيف العميل
  loyaltyPoints: number;
  createdAt: string;
  notes?: string;
}
