export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  // Location fields (Phase 1 - WhatsApp Bot v2)
  latitude?: number;
  longitude?: number;
  addressText?: string;
  customerType: 'registered' | 'casual';
  // Existing fields
  nationalId?: string;
  creditLimit: number;
  currentBalance: number;
  bonusBalance: number; // رصيد البونص (منفصل عن المدفوعات)
  previousStatement?: number; // Statement قديم
  salesRepId?: string; // المندوب المسؤول
  class?: "A" | "B" | "C"; // تصنيف العميل
  whatsappGroupId?: string; // جروب واتساب للإرسال (بديل عن رقم الهاتف) - للتوافق مع القديم
  invoiceGroupId?: string; // جروب واتساب للفواتير
  collectionGroupId?: string; // جروب واتساب للقبض وكشف الحساب
  loyaltyPoints: number;
  createdAt: string;
  notes?: string;
}
