import { CartItem } from "./CartItem";

export interface PendingOrder {
  id: string;
  items: CartItem[];
  customerId?: string;
  paymentType: string;
  timestamp: string;
}
