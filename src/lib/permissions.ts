// نظام الصلاحيات والأدوار

export type Permission =
  // صلاحيات المبيعات
  | "sales.create" // إنشاء فاتورة
  | "sales.view" // عرض الفواتير
  | "sales.edit" // تعديل الفواتير
  | "sales.delete" // حذف الفواتير
  | "sales.discount" // منح خصومات
  | "sales.return" // إنشاء مرتجعات المبيعات

  // صلاحيات العملاء
  | "customers.create"
  | "customers.view"
  | "customers.edit"
  | "customers.delete"
  | "customers.credit" // إدارة الديون والأقساط

  // صلاحيات المخزون
  | "inventory.view"
  | "inventory.create"
  | "inventory.edit"
  | "inventory.delete"
  | "inventory.purchase" // إنشاء مشتريات
  | "inventory.purchaseReturn" // إرجاع المشتريات

  // صلاحيات الموردين
  | "suppliers.create"
  | "suppliers.view"
  | "suppliers.edit"
  | "suppliers.delete"

  // صلاحيات الموظفين
  | "employees.create"
  | "employees.view"
  | "employees.edit"
  | "employees.delete"

  // صلاحيات الورديات
  | "shifts.open" // فتح وردية
  | "shifts.close" // إغلاق وردية
  | "shifts.view" // عرض الورديات
  | "shifts.edit" // تعديل الورديات
  | "shifts.bypass" // العمل بدون وردية (للمدراء)

  // صلاحيات التقارير
  | "reports.sales"
  | "reports.inventory"
  | "reports.customers"
  | "reports.employees"
  | "reports.financial"

  // صلاحيات المصروفات
  | "expenses.create"
  | "expenses.view"
  | "expenses.edit"
  | "expenses.delete"

  // صلاحيات الإعدادات
  | "settings.general"
  | "settings.users"
  | "settings.security"
  | "settings.backup"

  // صلاحيات العروض الترويجية
  | "promotions.create"
  | "promotions.view"
  | "promotions.edit"
  | "promotions.delete";

export type Role =
  | "admin"
  | "manager"
  | "cashier"
  | "inventory_manager"
  | "accountant";

// تعريف الصلاحيات لكل دور
export const rolePermissions: Record<Role, Permission[]> = {
  // المدير: جميع الصلاحيات
  admin: [
    // المبيعات
    "sales.create",
    "sales.view",
    "sales.edit",
    "sales.delete",
    "sales.discount",
    "sales.return",

    // العملاء
    "customers.create",
    "customers.view",
    "customers.edit",
    "customers.delete",
    "customers.credit",

    // المخزون
    "inventory.view",
    "inventory.create",
    "inventory.edit",
    "inventory.delete",
    "inventory.purchase",
    "inventory.purchaseReturn",

    // الموردين
    "suppliers.create",
    "suppliers.view",
    "suppliers.edit",
    "suppliers.delete",

    // الموظفين
    "employees.create",
    "employees.view",
    "employees.edit",
    "employees.delete",

    // الورديات
    "shifts.open",
    "shifts.close",
    "shifts.view",
    "shifts.edit",
    "shifts.bypass",

    // التقارير
    "reports.sales",
    "reports.inventory",
    "reports.customers",
    "reports.employees",
    "reports.financial",

    // المصروفات
    "expenses.create",
    "expenses.view",
    "expenses.edit",
    "expenses.delete",

    // الإعدادات
    "settings.general",
    "settings.users",
    "settings.security",
    "settings.backup",

    // العروض
    "promotions.create",
    "promotions.view",
    "promotions.edit",
    "promotions.delete",
  ],

  // المدير المساعد: معظم الصلاحيات ما عدا الإعدادات الحساسة
  manager: [
    "sales.create",
    "sales.view",
    "sales.edit",
    "sales.discount",
    "sales.return",
    "customers.create",
    "customers.view",
    "customers.edit",
    "customers.credit",
    "inventory.view",
    "inventory.create",
    "inventory.edit",
    "inventory.purchase",
    "inventory.purchaseReturn",
    "suppliers.view",
    "suppliers.edit",
    "employees.view",
    "shifts.open",
    "shifts.close",
    "shifts.view",
    "reports.sales",
    "reports.inventory",
    "reports.customers",
    "reports.employees",
    "expenses.create",
    "expenses.view",
    "expenses.edit",
    "settings.general",
    "promotions.create",
    "promotions.view",
    "promotions.edit",
  ],

  // الكاشير: صلاحيات المبيعات الأساسية فقط
  cashier: [
    "sales.create",
    "sales.view",
    "customers.view",
    "inventory.view",
    "shifts.view",
    "expenses.view",
  ],

  // مدير المخزون: صلاحيات المخزون والمشتريات
  inventory_manager: [
    "sales.view",
    "inventory.view",
    "inventory.create",
    "inventory.edit",
    "inventory.delete",
    "inventory.purchase",
    "inventory.purchaseReturn",
    "suppliers.create",
    "suppliers.view",
    "suppliers.edit",
    "reports.inventory",
    "shifts.view",
  ],

  // المحاسب: صلاحيات التقارير المالية والعملاء
  accountant: [
    "sales.view",
    "customers.view",
    "customers.credit",
    "inventory.view",
    "suppliers.view",
    "reports.sales",
    "reports.customers",
    "reports.financial",
    "expenses.view",
    "expenses.create",
    "shifts.view",
  ],
};

// دالة للتحقق من صلاحية معينة
export function hasPermission(userRole: Role, permission: Permission): boolean {
  return rolePermissions[userRole]?.includes(permission) || false;
}

// دالة للتحقق من أي صلاحية من مجموعة صلاحيات
export function hasAnyPermission(
  userRole: Role,
  permissions: Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(userRole, permission));
}

// دالة للتحقق من جميع الصلاحيات في مجموعة
export function hasAllPermissions(
  userRole: Role,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(userRole, permission));
}

// دالة للحصول على جميع صلاحيات دور معين
export function getRolePermissions(role: Role): Permission[] {
  return rolePermissions[role] || [];
}

// تسميات الأدوار بالعربية
export const roleLabels: Record<Role, string> = {
  admin: "مدير النظام",
  manager: "مدير مساعد",
  cashier: "كاشير",
  inventory_manager: "مدير المخزون",
  accountant: "محاسب",
};

// تسميات الصلاحيات بالعربية
export const permissionLabels: Record<Permission, string> = {
  "sales.create": "إنشاء فاتورة",
  "sales.view": "عرض الفواتير",
  "sales.edit": "تعديل الفواتير",
  "sales.delete": "حذف الفواتير",
  "sales.discount": "منح خصومات",
  "sales.return": "مرتجعات المبيعات",

  "customers.create": "إضافة عميل",
  "customers.view": "عرض العملاء",
  "customers.edit": "تعديل العملاء",
  "customers.delete": "حذف العملاء",
  "customers.credit": "إدارة الديون",

  "inventory.view": "عرض المخزون",
  "inventory.create": "إضافة منتج",
  "inventory.edit": "تعديل المنتج",
  "inventory.delete": "حذف المنتج",
  "inventory.purchase": "إنشاء مشتريات",
  "inventory.purchaseReturn": "مرتجعات المشتريات",

  "suppliers.create": "إضافة مورد",
  "suppliers.view": "عرض الموردين",
  "suppliers.edit": "تعديل الموردين",
  "suppliers.delete": "حذف الموردين",

  "employees.create": "إضافة موظف",
  "employees.view": "عرض الموظفين",
  "employees.edit": "تعديل الموظفين",
  "employees.delete": "حذف الموظفين",

  "shifts.open": "فتح وردية",
  "shifts.close": "إغلاق وردية",
  "shifts.view": "عرض الورديات",
  "shifts.edit": "تعديل الورديات",
  "shifts.bypass": "العمل بدون وردية",

  "reports.sales": "تقارير المبيعات",
  "reports.inventory": "تقارير المخزون",
  "reports.customers": "تقارير العملاء",
  "reports.employees": "تقارير الموظفين",
  "reports.financial": "التقارير المالية",

  "expenses.create": "إضافة مصروف",
  "expenses.view": "عرض المصروفات",
  "expenses.edit": "تعديل المصروفات",
  "expenses.delete": "حذف المصروفات",

  "settings.general": "الإعدادات العامة",
  "settings.users": "إدارة المستخدمين",
  "settings.security": "إعدادات الأمان",
  "settings.backup": "النسخ الاحتياطي",

  "promotions.create": "إضافة عرض",
  "promotions.view": "عرض العروض",
  "promotions.edit": "تعديل العروض",
  "promotions.delete": "حذف العروض",
};
