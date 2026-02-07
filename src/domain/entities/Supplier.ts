export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
  taxNumber?: string;
  balance: number;
  creditLimit: number;
  createdAt: string;
  notes?: string;
}
