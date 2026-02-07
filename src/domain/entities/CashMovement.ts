export interface CashMovement {
  id: string;
  shiftId: number;
  type: "in" | "out";
  amount: number;
  reason: string;
  category?: string;
  userId: string;
  userName: string;
  createdAt: string;
  notes?: string;
}
