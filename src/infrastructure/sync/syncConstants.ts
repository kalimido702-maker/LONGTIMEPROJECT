/**
 * Shared sync constants — single source of truth.
 * Import from here instead of duplicating in SyncEngine, SmartSyncManager, and ServerSyncHandler.
 */

/** Maps snake_case server table names → camelCase IndexedDB store names */
export const TABLE_TO_STORE_MAP: Record<string, string> = {
    product_categories: 'productCategories',
    product_units: 'productUnits',
    price_types: 'priceTypes',
    invoice_items: 'invoiceItems',
    sales_returns: 'salesReturns',
    purchase_items: 'purchaseItems',
    purchase_returns: 'purchaseReturns',
    expense_categories: 'expenseCategories',
    expense_items: 'expenseItems',
    deposit_sources: 'depositSources',
    payment_methods: 'paymentMethods',
    audit_logs: 'auditLogs',
    cash_movements: 'cashMovements',
    employee_advances: 'employeeAdvances',
    employee_deductions: 'employeeDeductions',
    whatsapp_accounts: 'whatsappAccounts',
    whatsapp_messages: 'whatsappMessages',
    whatsapp_campaigns: 'whatsappCampaigns',
    whatsapp_tasks: 'whatsappTasks',
    product_stock: 'productStock',
    purchase_payments: 'purchasePayments',
    restaurant_tables: 'tables',
    sales_reps: 'salesReps',
    supervisor_bonuses: 'supervisorBonuses',
    customer_bonuses: 'customerBonuses',
};

/** Reverse map: camelCase store name → snake_case table name */
export const STORE_TO_TABLE_MAP: Record<string, string> = Object.entries(
    TABLE_TO_STORE_MAP
).reduce((acc, [table, store]) => {
    acc[store] = table;
    return acc;
}, {} as Record<string, string>);

/** Returns the IndexedDB store name for a given server table name */
export function getStoreName(tableName: string): string {
    return TABLE_TO_STORE_MAP[tableName] ?? tableName;
}

/** Returns the server table name for a given IndexedDB store name */
export function getTableName(storeName: string): string {
    return STORE_TO_TABLE_MAP[storeName] ?? storeName;
}

/** All tables that participate in server sync */
export const SYNCABLE_TABLES = [
    // Core products & inventory
    'products',
    'product_categories',
    'product_units',
    'units',
    'price_types',
    'warehouses',
    // People
    'customers',
    'suppliers',
    'employees',
    'supervisors',
    'sales_reps',
    // Users & Permissions
    'users',
    'roles',
    // Sales
    'invoices',
    'invoice_items',
    'sales_returns',
    // Purchases
    'purchases',
    'purchase_items',
    'purchase_returns',
    // Finance
    'expenses',
    'expense_categories',
    'expense_items',
    'deposits',
    'deposit_sources',
    'payments',
    'payment_methods',
    'supervisor_bonuses',
    'customer_bonuses',
    // Operations
    'shifts',
    // Settings & Audit
    'settings',
    'audit_logs',
    // WhatsApp
    'whatsapp_accounts',
] as const;
