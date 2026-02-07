export interface Shift {
  id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime?: string;
  startingCash: number;
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  status: "active" | "closed";
  sales: ShiftSales;
  expenses: number;
  purchaseReturns: number;
  notes?: string;
  closedBy?: string;
}

export interface ShiftSales {
  totalInvoices: number;
  totalAmount: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  returns: number;
}
