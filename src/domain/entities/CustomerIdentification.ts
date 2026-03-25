/**
 * Customer Identification Number Entity
 * 
 * Supports multiple identification numbers per customer
 * (e.g., national ID, tax ID, commercial register, etc.)
 */
export interface CustomerIdentification {
  id: string;
  customerId: string;
  idNumber: string;
  label: string; // e.g., 'national_id', 'tax_id', 'commercial_register', 'primary'
  isActive: boolean;
  createdAt: string;
}
