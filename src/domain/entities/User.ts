export type User = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "admin" | "manager" | "cashier" | "accountant" | string; // يدعم الأدوار الثابتة والديناميكية
  roleId?: string; // معرف الدور من جدول roles (للأدوار المخصصة)
  active: boolean;
  createdAt?: string;
};
