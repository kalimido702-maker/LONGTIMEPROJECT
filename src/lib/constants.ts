/**
 * نظام Constants المركزي للتطبيق
 * جميع القيم الثابتة يجب أن تكون هنا لسهولة الصيانة والتعديل
 */

// ================== إعدادات النظام الافتراضية ==================
export const APP_DEFAULTS = {
    // إعدادات العملة
    CURRENCY: {
        CODE: 'EGP',
        SYMBOL: 'ج.م',
        DECIMAL_PLACES: 2,
    },

    // إعدادات الضريبة
    TAX: {
        DEFAULT_RATE: 14,
        IS_INCLUSIVE: false,
    },

    // إعدادات الفواتير
    INVOICE: {
        PREFIX: 'INV',
        STARTING_NUMBER: 1000,
        PRINT_AUTO: false,
    },

    // إعدادات الطباعة
    PRINTING: {
        PAPER_SIZE: '80mm',
        SHOW_LOGO: true,
        SHOW_FOOTER: true,
    },

    // إعدادات النسخ الاحتياطي
    BACKUP: {
        AUTO_BACKUP: false,
        BACKUP_INTERVAL: 24, // ساعات
    },
} as const;

// ================== أنواع الدفع ==================
export const PAYMENT_METHODS = {
    CASH: { id: 'cash', name: 'نقدي', icon: 'Banknote' },
    CARD: { id: 'card', name: 'بطاقة', icon: 'CreditCard' },
    TRANSFER: { id: 'transfer', name: 'تحويل بنكي', icon: 'ArrowRightLeft' },
    WALLET: { id: 'wallet', name: 'محفظة إلكترونية', icon: 'Wallet' },
    CHECK: { id: 'check', name: 'شيك', icon: 'FileText' },
    CREDIT: { id: 'credit', name: 'آجل', icon: 'Clock' },
} as const;

// ================== حالات الفواتير ==================
export const INVOICE_STATUS = {
    PAID: { id: 'paid', name: 'مدفوعة', color: 'success' },
    PENDING: { id: 'pending', name: 'معلقة', color: 'warning' },
    CANCELLED: { id: 'cancelled', name: 'ملغاة', color: 'destructive' },
    PARTIAL: { id: 'partial', name: 'دفع جزئي', color: 'secondary' },
} as const;

// ================== أنواع المستخدمين ==================
export const USER_ROLES = {
    ADMIN: { id: 'admin', name: 'مدير', permissions: '*' },
    MANAGER: { id: 'manager', name: 'مدير فرع', permissions: 'manager' },
    CASHIER: { id: 'cashier', name: 'كاشير', permissions: 'cashier' },
    EMPLOYEE: { id: 'employee', name: 'موظف', permissions: 'employee' },
} as const;

// ================== أحجام الورق للطباعة ==================
export const PAPER_SIZES = {
    A4: { id: 'A4', name: 'A4', width: 210, height: 297 },
    THERMAL_80MM: { id: '80mm', name: '80mm حراري', width: 80, height: 'auto' },
    THERMAL_58MM: { id: '58mm', name: '58mm حراري', width: 58, height: 'auto' },
} as const;

// ================== العملات المدعومة ==================
export const SUPPORTED_CURRENCIES = [
    { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' },
    { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي' },
    { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي' },
    { code: 'USD', symbol: '$', name: 'دولار أمريكي' },
    { code: 'EUR', symbol: '€', name: 'يورو' },
] as const;

// ================== فئات المنتجات الافتراضية ==================
export const DEFAULT_CATEGORIES = [
    'إلكترونيات',
    'ملابس',
    'أغذية',
    'مشروبات',
    'مستحضرات تجميل',
    'أدوات منزلية',
    'قرطاسية',
    'أخرى',
] as const;

// ================== وحدات القياس ==================
export const UNITS_OF_MEASURE = [
    { id: 'piece', name: 'قطعة', abbreviation: 'قطعة' },
    { id: 'kg', name: 'كيلوجرام', abbreviation: 'كجم' },
    { id: 'gram', name: 'جرام', abbreviation: 'جم' },
    { id: 'liter', name: 'لتر', abbreviation: 'لتر' },
    { id: 'meter', name: 'متر', abbreviation: 'م' },
    { id: 'box', name: 'صندوق', abbreviation: 'صندوق' },
    { id: 'carton', name: 'كرتونة', abbreviation: 'كرتونة' },
    { id: 'dozen', name: 'دستة', abbreviation: 'دستة' },
] as const;

// ================== رسائل النظام ==================
export const SYSTEM_MESSAGES = {
    // رسائل النجاح
    SUCCESS: {
        SAVE: 'تم الحفظ بنجاح',
        UPDATE: 'تم التحديث بنجاح',
        DELETE: 'تم الحذف بنجاح',
        PAYMENT: 'تمت عملية الدفع بنجاح',
        PRINT: 'تمت الطباعة بنجاح',
        BACKUP: 'تم إنشاء النسخة الاحتياطية بنجاح',
    },

    // رسائل الخطأ
    ERROR: {
        SAVE: 'حدث خطأ أثناء الحفظ',
        UPDATE: 'حدث خطأ أثناء التحديث',
        DELETE: 'حدث خطأ أثناء الحذف',
        PAYMENT: 'حدث خطأ في عملية الدفع',
        PRINT: 'حدث خطأ أثناء الطباعة',
        BACKUP: 'حدث خطأ أثناء النسخ الاحتياطي',
        NETWORK: 'حدث خطأ في الاتصال',
        PERMISSION: 'ليس لديك صلاحية لهذا الإجراء',
    },

    // رسائل التحذير
    WARNING: {
        UNSAVED_CHANGES: 'يوجد تغييرات غير محفوظة',
        LOW_STOCK: 'المخزون منخفض',
        DUPLICATE: 'هذا العنصر موجود مسبقاً',
        DELETE_CONFIRM: 'هل أنت متأكد من الحذف؟',
    },

    // رسائل المعلومات
    INFO: {
        LOADING: 'جاري التحميل...',
        PROCESSING: 'جاري المعالجة...',
        NO_DATA: 'لا توجد بيانات',
        EMPTY_CART: 'السلة فارغة',
    },
} as const;

// ================== تنسيقات التواريخ ==================
export const DATE_FORMATS = {
    DISPLAY: 'dd/MM/yyyy',
    DISPLAY_WITH_TIME: 'dd/MM/yyyy HH:mm',
    DISPLAY_TIME: 'HH:mm',
    API: "yyyy-MM-dd'T'HH:mm:ss",
    FILE_NAME: 'yyyy-MM-dd_HHmmss',
    READABLE: 'd MMMM yyyy',
} as const;

// ================== تنسيقات الأرقام ==================
export const NUMBER_FORMATS = {
    CURRENCY: {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    },
    PERCENTAGE: {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    },
    QUANTITY: {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    },
} as const;

// ================== حدود النظام ==================
export const SYSTEM_LIMITS = {
    MAX_INVOICE_ITEMS: 100,
    MAX_DISCOUNT_PERCENTAGE: 100,
    MIN_PRODUCT_PRICE: 0.01,
    MAX_PRODUCT_PRICE: 999999999,
    MAX_QUANTITY: 999999,
    MIN_QUANTITY: 0.001,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    MAX_BACKUP_FILES: 10,
} as const;

// ================== أنماط الفواتير ==================
export const INVOICE_TYPES = {
    SALES: { id: 'sales', name: 'فاتورة مبيعات', color: 'primary' },
    PURCHASE: { id: 'purchase', name: 'فاتورة مشتريات', color: 'secondary' },
    RETURN: { id: 'return', name: 'فاتورة مرتجع', color: 'destructive' },
    QUOTE: { id: 'quote', name: 'عرض سعر', color: 'muted' },
} as const;

// ================== أنواع المعاملات المالية ==================
export const TRANSACTION_TYPES = {
    SALE: { id: 'sale', name: 'مبيعات', icon: 'TrendingUp', color: 'success' },
    PURCHASE: { id: 'purchase', name: 'مشتريات', icon: 'ShoppingCart', color: 'primary' },
    EXPENSE: { id: 'expense', name: 'مصروفات', icon: 'TrendingDown', color: 'destructive' },
    RETURN: { id: 'return', name: 'مرتجعات', icon: 'RotateCcw', color: 'warning' },
    PAYMENT: { id: 'payment', name: 'دفعات', icon: 'DollarSign', color: 'secondary' },
} as const;

// ================== إعدادات الجداول (Pagination) ==================
export const TABLE_SETTINGS = {
    DEFAULT_PAGE_SIZE: 10,
    PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
    MAX_VISIBLE_PAGES: 5,
} as const;

// ================== إعدادات الـ Cache ==================
export const CACHE_SETTINGS = {
    PRODUCTS_TTL: 1000 * 60 * 5, // 5 دقائق
    CUSTOMERS_TTL: 1000 * 60 * 10, // 10 دقائق
    SETTINGS_TTL: 1000 * 60 * 30, // 30 دقيقة
    REPORTS_TTL: 1000 * 60 * 2, // 2 دقيقة
} as const;

// ================== رموز الاختصارات (Keyboard Shortcuts) ==================
export const SHORTCUTS = {
    NEW_INVOICE: 'F1',
    SEARCH_PRODUCT: 'F2',
    SEARCH_CUSTOMER: 'F3',
    CHECKOUT: 'F4',
    PRINT: 'Ctrl+P',
    SAVE: 'Ctrl+S',
    CANCEL: 'Escape',
    DELETE: 'Delete',
} as const;

// ================== إعدادات WhatsApp ==================
export const WHATSAPP_SETTINGS = {
    QR_SIZE: 256,
    QR_MARGIN: 4,
    MAX_MESSAGE_LENGTH: 4096,
    RECONNECT_INTERVAL: 5000,
} as const;

// ================== أنواع التقارير ==================
export const REPORT_TYPES = {
    SALES: { id: 'sales', name: 'تقرير المبيعات', icon: 'TrendingUp' },
    INVENTORY: { id: 'inventory', name: 'تقرير المخزون', icon: 'Package' },
    FINANCIAL: { id: 'financial', name: 'التقرير المالي', icon: 'DollarSign' },
    CUSTOMER: { id: 'customer', name: 'تقرير العملاء', icon: 'Users' },
    EMPLOYEE: { id: 'employee', name: 'تقرير الموظفين', icon: 'UserCheck' },
    SHIFT: { id: 'shift', name: 'تقرير الورديات', icon: 'Clock' },
} as const;

// ================== حالات الورديات ==================
export const SHIFT_STATUS = {
    OPEN: { id: 'open', name: 'مفتوحة', color: 'success' },
    CLOSED: { id: 'closed', name: 'مغلقة', color: 'muted' },
} as const;

// ================== أنواع حركات النقدية ==================
export const CASH_MOVEMENT_TYPES = {
    OPENING: { id: 'opening', name: 'رصيد افتتاحي', icon: 'Plus', color: 'success' },
    DEPOSIT: { id: 'deposit', name: 'إيداع', icon: 'ArrowDown', color: 'success' },
    WITHDRAWAL: { id: 'withdrawal', name: 'سحب', icon: 'ArrowUp', color: 'destructive' },
    CLOSING: { id: 'closing', name: 'رصيد ختامي', icon: 'Minus', color: 'muted' },
} as const;

// ================== صلاحيات النظام ==================
export const PERMISSIONS = {
    // إدارة المبيعات
    SALES_VIEW: 'sales.view',
    SALES_CREATE: 'sales.create',
    SALES_EDIT: 'sales.edit',
    SALES_DELETE: 'sales.delete',
    SALES_DISCOUNT: 'sales.discount',

    // إدارة المخزون
    INVENTORY_VIEW: 'inventory.view',
    INVENTORY_CREATE: 'inventory.create',
    INVENTORY_EDIT: 'inventory.edit',
    INVENTORY_DELETE: 'inventory.delete',

    // إدارة العملاء
    CUSTOMERS_VIEW: 'customers.view',
    CUSTOMERS_CREATE: 'customers.create',
    CUSTOMERS_EDIT: 'customers.edit',
    CUSTOMERS_DELETE: 'customers.delete',

    // إدارة المصروفات
    EXPENSES_VIEW: 'expenses.view',
    EXPENSES_CREATE: 'expenses.create',
    EXPENSES_EDIT: 'expenses.edit',
    EXPENSES_DELETE: 'expenses.delete',

    // التقارير
    REPORTS_VIEW: 'reports.view',
    REPORTS_EXPORT: 'reports.export',

    // الإعدادات
    SETTINGS_VIEW: 'settings.view',
    SETTINGS_EDIT: 'settings.edit',

    // إدارة المستخدمين
    USERS_VIEW: 'users.view',
    USERS_CREATE: 'users.create',
    USERS_EDIT: 'users.edit',
    USERS_DELETE: 'users.delete',

    // الورديات
    SHIFTS_VIEW: 'shifts.view',
    SHIFTS_MANAGE: 'shifts.manage',
} as const;

// Helper Types
export type PaymentMethodId = keyof typeof PAYMENT_METHODS;
export type InvoiceStatusId = keyof typeof INVOICE_STATUS;
export type UserRoleId = keyof typeof USER_ROLES;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]['code'];
export type InvoiceTypeId = keyof typeof INVOICE_TYPES;
export type TransactionTypeId = keyof typeof TRANSACTION_TYPES;
export type ReportTypeId = keyof typeof REPORT_TYPES;
export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];
