export type Employee = {
  id: string;
  name: string;
  phone: string;
  nationalId: string;
  position: string;
  salary: number;
  hireDate: string;
  salaryDay: number; // يوم صرف الراتب (1-31)
  deductions?: number; // الخصومات الشهرية الثابتة
  active: boolean;
  userId?: string;
  role?: "admin" | "manager" | "cashier" | "accountant" | string; // يدعم الأدوار الثابتة والديناميكية
  roleId?: string; // معرف الدور من جدول roles (للأدوار المخصصة)
  notes?: string;
};
