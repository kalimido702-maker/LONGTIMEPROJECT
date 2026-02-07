export interface RestaurantTable {
  id: string;
  tableNumber: string;
  hallId: string;
  capacity: number;
  status: "available" | "occupied" | "reserved";
  currentInvoiceId?: string;
}

export interface Hall {
  id: string;
  name: string;
  description?: string;
  active: boolean;
}
