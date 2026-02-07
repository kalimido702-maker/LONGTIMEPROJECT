export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "paid";
  approvedBy?: string;
  approvedAt?: string;
  paidAmount?: number;
  remainingAmount?: number;
  deductionAmount?: number;
  userId: string;
  userName: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EmployeeDeduction {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  type: "fixed" | "oneTime";
  reason: string;
  startDate: string;
  endDate?: string;
  status: "active" | "completed" | "cancelled";
  userId: string;
  userName: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
