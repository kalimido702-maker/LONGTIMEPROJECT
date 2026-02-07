export interface Printer {
  id: string;
  name: string;
  type: "thermal" | "a4";
  ipAddress?: string;
  port?: string;
  active: boolean;
}

export interface PaymentApp {
  id: string;
  name: string;
  type: "bank" | "wallet" | "card";
  apiKey?: string;
  active: boolean;
  fees: number;
}

export interface Setting {
  key: string;
  value: string;
  description?: string;
  category?: "company" | "tax" | "receipt" | "system";
  updatedAt: string;
}
