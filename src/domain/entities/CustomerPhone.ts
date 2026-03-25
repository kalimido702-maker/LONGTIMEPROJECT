/**
 * Customer Phone Entity
 * 
 * Supports multiple phone numbers per customer.
 * This enables looking up customers by any of their registered phones.
 */
export interface CustomerPhone {
  id: string;
  customerId: string;
  phone: string;
  label: string; // e.g., 'mobile', 'home', 'work', 'whatsapp'
  isActive: boolean;
  createdAt: string;
}
