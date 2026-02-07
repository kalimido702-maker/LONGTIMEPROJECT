export interface DepositSource {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Deposit {
  id: string;
  amount: number;
  sourceId: string;
  sourceName: string;
  userId: string;
  userName: string;
  shiftId?: string;
  notes?: string;
  createdAt: string;
}
