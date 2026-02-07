export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  userId: string;
  createdAt: string;
  notes?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ExpenseItem {
  id: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  description: string;
  userId: string;
  userName: string;
  shiftId?: string;
  notes?: string;
  createdAt: string;
}
