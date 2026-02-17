import bcrypt from 'bcrypt';

/**
 * FieldMapper - COMPLETE Data transformation layer between client and server schemas
 * 
 * Based on ACTUAL MySQL schema from migrations
 * Handles:
 * - camelCase (client) ↔ snake_case (server) conversion
 * - Adding required server fields (client_id, branch_id)
 * - Removing client-only fields
 * - Default values for optional server fields
 * - Skipping base64 images
 * - Validating foreign keys
 */

// Helper: Convert ISO 8601 to MySQL datetime format
function toMySQLDateTime(isoString: string): string {
    if (!isoString) return isoString;
    return isoString.replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// Helper: Skip base64 images
function skipBase64(val: string): string | null {
    if (!val) return null;
    if (val.startsWith('data:')) return null;
    return val;
}

// Helper: Validate ID format (UUID, numeric, or compound IDs with underscores)
function validateId(val: string): string | null {
    if (!val) return null;
    // UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return val;
    // Numeric ID
    if (/^\d+$/.test(val)) return val;
    // Compound ID with underscores (e.g., 1763927275416_fu3ulz97e or default-unit)
    if (/^[a-zA-Z0-9_-]+$/.test(val)) return val;
    // Otherwise skip
    return null;
}

interface FieldMapping {
    clientField: string;
    serverField: string;
    defaultValue?: any;
    transform?: (value: any) => any;
    clientToServerOnly?: boolean; // If true, this mapping is only used for client→server, not reversed
}

interface TableMapping {
    fields: FieldMapping[];
    serverDefaults?: Record<string, any>;
    clientOnlyFields?: string[];
}

// ==================== COMPLETE TABLE MAPPINGS ====================

// Product Categories - MySQL: name_ar, name_en, description, color, bonus_percentage, parent_id, mixed_layout, active
const PRODUCT_CATEGORIES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'nameAr', serverField: 'name_ar' },
        { clientField: 'name', serverField: 'name_ar' },
        { clientField: 'description', serverField: 'description', defaultValue: '' },
        { clientField: 'bonusPercentage', serverField: 'bonus_percentage', defaultValue: 0 },
        { clientField: 'parentId', serverField: 'parent_id', transform: validateId },
        { clientField: 'mixedLayout', serverField: 'mixed_layout', defaultValue: false },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    serverDefaults: { name_en: null, color: null },
    clientOnlyFields: ['local_updated_at'],
};

// Products - MySQL: name, name_en, description, barcode, sku, cost_price, selling_price, stock, min_stock, max_stock, unit, tax_rate, discount_rate, active, image_url, category_id
const PRODUCTS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'nameAr', serverField: 'name' },
        { clientField: 'nameEn', serverField: 'name_en' },
        { clientField: 'description', serverField: 'description' },
        { clientField: 'barcode', serverField: 'barcode' },
        { clientField: 'sku', serverField: 'sku' },
        { clientField: 'price', serverField: 'selling_price', defaultValue: 0 },
        { clientField: 'sellingPrice', serverField: 'selling_price', defaultValue: 0 },
        { clientField: 'cost', serverField: 'cost_price', defaultValue: 0 },
        { clientField: 'costPrice', serverField: 'cost_price', defaultValue: 0 },
        { clientField: 'stock', serverField: 'stock', defaultValue: 0 },
        { clientField: 'minStock', serverField: 'min_stock', defaultValue: 0 },
        { clientField: 'maxStock', serverField: 'max_stock', defaultValue: 0 },
        { clientField: 'unit', serverField: 'unit', defaultValue: 'piece' },
        { clientField: 'unitsPerCarton', serverField: 'units_per_carton' },
        { clientField: 'taxRate', serverField: 'tax_rate', defaultValue: 0 },
        { clientField: 'discountRate', serverField: 'discount_rate', defaultValue: 0 },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'category', serverField: 'category_id', transform: validateId, clientToServerOnly: true },
        { clientField: 'categoryId', serverField: 'category_id', transform: validateId },
        { clientField: 'imageUrl', serverField: 'image_url', transform: skipBase64 },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'prices', 'unitId', 'defaultPriceTypeId', 'expiryDate', 'hasMultipleUnits', 'userId'],
};

// Customers - MySQL: name, phone, email, address, credit_limit, balance, notes, sales_rep_id, bonus_balance, etc.
const CUSTOMERS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'phone', serverField: 'phone' },
        { clientField: 'email', serverField: 'email' },
        { clientField: 'address', serverField: 'address' },
        { clientField: 'creditLimit', serverField: 'credit_limit', defaultValue: 0 },
        { clientField: 'balance', serverField: 'balance', defaultValue: 0 },
        { clientField: 'currentBalance', serverField: 'balance', defaultValue: 0 },
        { clientField: 'notes', serverField: 'notes' },
        // New fields for sales rep integration
        { clientField: 'salesRepId', serverField: 'sales_rep_id', transform: validateId },
        { clientField: 'bonusBalance', serverField: 'bonus_balance', defaultValue: 0 },
        { clientField: 'previousStatement', serverField: 'previous_statement', defaultValue: 0 },
        { clientField: 'loyaltyPoints', serverField: 'loyalty_points', defaultValue: 0 },
        { clientField: 'nationalId', serverField: 'national_id' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'totalPurchases', 'active'],
};

// Suppliers - MySQL: name, phone, email, address, tax_number, credit_limit, balance, payment_terms, notes
const SUPPLIERS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'phone', serverField: 'phone' },
        { clientField: 'email', serverField: 'email' },
        { clientField: 'address', serverField: 'address' },
        { clientField: 'taxNumber', serverField: 'tax_number' },
        { clientField: 'creditLimit', serverField: 'credit_limit', defaultValue: 0 },
        { clientField: 'balance', serverField: 'balance', defaultValue: 0 },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'active'],
};

// Employees - MySQL: name, phone, email, position, salary, hire_date, active, notes, user_id
const EMPLOYEES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'phone', serverField: 'phone' },
        { clientField: 'email', serverField: 'email' },
        { clientField: 'position', serverField: 'position' },
        { clientField: 'salary', serverField: 'salary', defaultValue: 0 },
        { clientField: 'hireDate', serverField: 'hire_date' },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'userId', serverField: 'user_id' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Invoices - MySQL: invoice_number, customer_id, total, discount, tax, net_total, paid_amount, remaining_amount, payment_status, invoice_date, notes, created_by
const INVOICES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'invoiceNumber', serverField: 'invoice_number' },
        { clientField: 'customerId', serverField: 'customer_id', transform: validateId },
        { clientField: 'total', serverField: 'total', defaultValue: 0 },
        { clientField: 'discount', serverField: 'discount', defaultValue: 0 },
        { clientField: 'tax', serverField: 'tax', defaultValue: 0 },
        { clientField: 'netTotal', serverField: 'net_total', defaultValue: 0 },
        { clientField: 'paidAmount', serverField: 'paid_amount', defaultValue: 0 },
        { clientField: 'remainingAmount', serverField: 'remaining_amount', defaultValue: 0 },
        { clientField: 'paymentStatus', serverField: 'payment_status', defaultValue: 'unpaid' },
        { clientField: 'invoiceDate', serverField: 'invoice_date', transform: toMySQLDateTime },
        { clientField: 'createdAt', serverField: 'invoice_date', transform: toMySQLDateTime },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'userId', serverField: 'created_by' },
    ],
    serverDefaults: { invoice_number: () => `INV-${Date.now()}` },
    clientOnlyFields: ['local_updated_at', 'items', 'userName', 'shiftId', 'paymentType', 'paymentMethodIds', 'paymentMethodAmounts', 'subtotal', 'updatedAt'],
};

// Purchases - MySQL: purchase_number, supplier_id, total, discount, tax, net_total, paid_amount, remaining_amount, payment_status, purchase_date, notes, created_by
const PURCHASES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'purchaseNumber', serverField: 'purchase_number' },
        { clientField: 'supplierId', serverField: 'supplier_id', transform: validateId },
        { clientField: 'total', serverField: 'total', defaultValue: 0 },
        { clientField: 'totalAmount', serverField: 'total', defaultValue: 0 },
        { clientField: 'discount', serverField: 'discount', defaultValue: 0 },
        { clientField: 'tax', serverField: 'tax', defaultValue: 0 },
        { clientField: 'netTotal', serverField: 'net_total', defaultValue: 0 },
        { clientField: 'paidAmount', serverField: 'paid_amount', defaultValue: 0 },
        { clientField: 'remainingAmount', serverField: 'remaining_amount', defaultValue: 0 },
        { clientField: 'paymentStatus', serverField: 'payment_status', defaultValue: 'unpaid' },
        { clientField: 'purchaseDate', serverField: 'purchase_date', transform: toMySQLDateTime },
        { clientField: 'createdAt', serverField: 'purchase_date', transform: toMySQLDateTime },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'userId', serverField: 'created_by' },
    ],
    serverDefaults: { purchase_number: () => `PUR-${Date.now()}` },
    clientOnlyFields: ['local_updated_at', 'items', 'shiftId', 'updatedAt'],
};

// Expenses - MySQL: category_id, amount, expense_date, payment_method_id, description, receipt_number, notes
const EXPENSES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'categoryId', serverField: 'category_id', transform: validateId },
        { clientField: 'amount', serverField: 'amount' },
        { clientField: 'expenseDate', serverField: 'expense_date', transform: toMySQLDateTime },
        { clientField: 'createdAt', serverField: 'expense_date', transform: toMySQLDateTime },
        { clientField: 'paymentMethodId', serverField: 'payment_method_id', transform: validateId },
        { clientField: 'description', serverField: 'description' },
        { clientField: 'receiptNumber', serverField: 'receipt_number' },
        { clientField: 'notes', serverField: 'notes' },
    ],
    clientOnlyFields: ['local_updated_at', 'category'],
};

// Shifts - MySQL: employee_id, start_time, end_time, status, opening_cash, closing_cash, total_sales, notes
const SHIFTS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'employeeId', serverField: 'employee_id' },
        { clientField: 'startTime', serverField: 'start_time', transform: toMySQLDateTime },
        { clientField: 'endTime', serverField: 'end_time', transform: toMySQLDateTime },
        { clientField: 'status', serverField: 'status', defaultValue: 'open' },
        { clientField: 'startingCash', serverField: 'opening_cash', defaultValue: 0 },
        { clientField: 'openingCash', serverField: 'opening_cash', defaultValue: 0 },
        { clientField: 'closingCash', serverField: 'closing_cash', defaultValue: 0 },
        { clientField: 'totalSales', serverField: 'total_sales', defaultValue: 0 },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'employeeName', 'sales', 'expenses', 'purchaseReturns'],
};


// Units - SQLite: name, name_en, symbol, is_base, conversion_factor, active
const UNITS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'nameEn', serverField: 'name_en' },
        { clientField: 'symbol', serverField: 'symbol' },
        { clientField: 'isDefault', serverField: 'is_base', defaultValue: false },
        { clientField: 'isBase', serverField: 'is_base', defaultValue: false },
        { clientField: 'conversionFactor', serverField: 'conversion_factor', defaultValue: 1 },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Price Types - SQLite: name, name_en, description, is_default, active
const PRICE_TYPES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'nameEn', serverField: 'name_en' },
        { clientField: 'description', serverField: 'description' },
        { clientField: 'isDefault', serverField: 'is_default', defaultValue: false },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'displayOrder'],
};

// Warehouses - SQLite: name, name_en, address, is_default, active
const WAREHOUSES_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'nameAr', serverField: 'name' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'nameEn', serverField: 'name_en' },
        { clientField: 'address', serverField: 'address' },
        { clientField: 'isDefault', serverField: 'is_default', defaultValue: false },
        { clientField: 'isActive', serverField: 'active', defaultValue: true },
        { clientField: 'active', serverField: 'active', defaultValue: true },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Audit Logs - MySQL: action, entity, user_id, shift_id, ref_id, details
const AUDIT_LOGS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'action', serverField: 'action' },
        { clientField: 'entity', serverField: 'entity' },
        { clientField: 'refId', serverField: 'ref_id' },
        { clientField: 'userId', serverField: 'user_id' },
        { clientField: 'shiftId', serverField: 'shift_id' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'userName', 'newValue', 'oldValue'],
};

// Payments - MySQL: invoice_id, customer_id, amount, method, notes
const PAYMENTS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'invoiceId', serverField: 'invoice_id', transform: validateId },
        { clientField: 'customerId', serverField: 'customer_id', transform: validateId },
        { clientField: 'amount', serverField: 'amount' },
        { clientField: 'method', serverField: 'method' },
        { clientField: 'notes', serverField: 'notes' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Settings - MySQL: id, setting_key, setting_value, setting_group, description
const SETTINGS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'key', serverField: 'setting_key' },
        { clientField: 'value', serverField: 'setting_value' },
        { clientField: 'category', serverField: 'setting_group', defaultValue: 'general' },
        { clientField: 'description', serverField: 'description' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Payment Methods - MySQL: name, name_en, type, active, sort_order
const PAYMENT_METHODS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'name', serverField: 'name' },
        { clientField: 'nameEn', serverField: 'name_en' },
        { clientField: 'type', serverField: 'type', defaultValue: 'cash' },
        { clientField: 'active', serverField: 'active', defaultValue: 1 },
        { clientField: 'sortOrder', serverField: 'sort_order', defaultValue: 0 },
        { clientField: 'createdBy', serverField: 'created_by' },
        { clientField: 'updatedBy', serverField: 'updated_by' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Expense Items - MySQL: category_id, user_id, shift_id, amount, description
const EXPENSE_ITEMS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'categoryId', serverField: 'category_id', transform: validateId },
        { clientField: 'userId', serverField: 'user_id', transform: validateId },
        { clientField: 'shiftId', serverField: 'shift_id', transform: validateId },
        { clientField: 'amount', serverField: 'amount' },
        { clientField: 'description', serverField: 'description' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at'],
};

// Invoice Items - MySQL: invoice_id, product_id, quantity, unit_price, discount, tax, total
const INVOICE_ITEMS_MAPPING: TableMapping = {
    fields: [
        { clientField: 'id', serverField: 'id' },
        { clientField: 'invoiceId', serverField: 'invoice_id', transform: validateId },
        { clientField: 'productId', serverField: 'product_id', transform: validateId },
        { clientField: 'quantity', serverField: 'quantity' },
        { clientField: 'price', serverField: 'unit_price' },
        { clientField: 'discount', serverField: 'discount', defaultValue: 0 },
        { clientField: 'tax', serverField: 'tax', defaultValue: 0 },
        { clientField: 'total', serverField: 'total' },
        { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
    ],
    clientOnlyFields: ['local_updated_at', 'productName', 'unitId', 'unitName', 'conversionFactor',
        'priceTypeId', 'priceTypeName', 'selectedUnitName', 'productUnitId'],
};

// ==================== MASTER MAPPING REGISTRY ====================
const TABLE_MAPPINGS: Record<string, TableMapping> = {
    product_categories: PRODUCT_CATEGORIES_MAPPING,
    products: PRODUCTS_MAPPING,
    customers: CUSTOMERS_MAPPING,
    suppliers: SUPPLIERS_MAPPING,
    employees: EMPLOYEES_MAPPING,
    invoices: INVOICES_MAPPING,
    invoice_items: INVOICE_ITEMS_MAPPING,
    purchases: PURCHASES_MAPPING,
    expenses: EXPENSES_MAPPING,
    expense_items: EXPENSE_ITEMS_MAPPING,
    shifts: SHIFTS_MAPPING,
    units: UNITS_MAPPING,
    price_types: PRICE_TYPES_MAPPING,
    warehouses: WAREHOUSES_MAPPING,
    audit_logs: AUDIT_LOGS_MAPPING,
    payments: PAYMENTS_MAPPING,
    payment_methods: PAYMENT_METHODS_MAPPING,
    settings: SETTINGS_MAPPING,
    // Product Units - MySQL: product_id, unit_id, barcode, conversion_factor, price
    product_units: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'productId', serverField: 'product_id', transform: validateId },
            { clientField: 'unitId', serverField: 'unit_id', transform: validateId },
            { clientField: 'barcode', serverField: 'barcode' },
            { clientField: 'conversionFactor', serverField: 'conversion_factor', defaultValue: 1 },
            { clientField: 'price', serverField: 'price' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'unitName', 'prices'],
    },
    // Expense Categories - MySQL: name, name_en, description, active
    expense_categories: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'nameEn', serverField: 'name_en' },
            { clientField: 'description', serverField: 'description' },
            { clientField: 'active', serverField: 'active', defaultValue: 1 },
            { clientField: 'createdBy', serverField: 'created_by' },
            { clientField: 'updatedBy', serverField: 'updated_by' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Sales Returns - MySQL: original_invoice_id, customer_id, total_amount, total, reason, status
    sales_returns: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'originalInvoiceId', serverField: 'original_invoice_id', transform: validateId },
            { clientField: 'invoiceId', serverField: 'original_invoice_id', transform: validateId },
            { clientField: 'customerId', serverField: 'customer_id', transform: validateId },
            { clientField: 'totalAmount', serverField: 'total_amount' },
            { clientField: 'total', serverField: 'total' },
            { clientField: 'subtotal', serverField: 'total' },
            { clientField: 'reason', serverField: 'reason' },
            { clientField: 'status', serverField: 'status', defaultValue: 'completed' },
            { clientField: 'returnDate', serverField: 'return_date', transform: toMySQLDateTime },
            { clientField: 'createdAt', serverField: 'return_date', transform: toMySQLDateTime },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'items', 'customerName', 'invoiceNumber', 'refundMethod', 'refundStatus', 'deliveryStatus', 'userName', 'userId', 'tax'],
    },
    // WhatsApp Accounts - MySQL: name, phone, status, daily_limit, daily_sent, last_reset_date, anti_spam_delay, is_active, last_connected_at
    whatsapp_accounts: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'phone', serverField: 'phone' },
            { clientField: 'status', serverField: 'status', defaultValue: 'disconnected' },
            { clientField: 'dailyLimit', serverField: 'daily_limit', defaultValue: 100 },
            { clientField: 'dailySent', serverField: 'daily_sent', defaultValue: 0 },
            { clientField: 'lastResetDate', serverField: 'last_reset_date', transform: toMySQLDateTime },
            { clientField: 'antiSpamDelay', serverField: 'anti_spam_delay', defaultValue: 3000 },
            { clientField: 'isActive', serverField: 'is_active', defaultValue: false },
            { clientField: 'lastConnectedAt', serverField: 'last_connected_at', transform: toMySQLDateTime },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'qrCode'],
    },
    // WhatsApp Messages - MySQL: account_id, to_phone, message, media_type, media_url, status, retries, scheduled_at, sent_at, error
    whatsapp_messages: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'accountId', serverField: 'account_id', transform: validateId },
            { clientField: 'to', serverField: 'to_phone' },
            { clientField: 'message', serverField: 'message' },
            { clientField: 'status', serverField: 'status', defaultValue: 'pending' },
            { clientField: 'retries', serverField: 'retries', defaultValue: 0 },
            { clientField: 'scheduledAt', serverField: 'scheduled_at', transform: toMySQLDateTime },
            { clientField: 'sentAt', serverField: 'sent_at', transform: toMySQLDateTime },
            { clientField: 'error', serverField: 'error' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'media', 'metadata', 'errorAr'],
    },
    // WhatsApp Campaigns - MySQL: name, account_id, template, variables, target_type, filters, status, scheduled_at, total_recipients, sent_count, failed_count, completed_at
    whatsapp_campaigns: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'accountId', serverField: 'account_id', transform: validateId },
            { clientField: 'template', serverField: 'template' },
            { clientField: 'variables', serverField: 'variables', transform: (v: any) => JSON.stringify(v) },
            { clientField: 'targetType', serverField: 'target_type' },
            { clientField: 'filters', serverField: 'filters', transform: (v: any) => v ? JSON.stringify(v) : null },
            { clientField: 'status', serverField: 'status', defaultValue: 'draft' },
            { clientField: 'scheduledAt', serverField: 'scheduled_at', transform: toMySQLDateTime },
            { clientField: 'totalRecipients', serverField: 'total_recipients', defaultValue: 0 },
            { clientField: 'sentCount', serverField: 'sent_count', defaultValue: 0 },
            { clientField: 'failedCount', serverField: 'failed_count', defaultValue: 0 },
            { clientField: 'completedAt', serverField: 'completed_at', transform: toMySQLDateTime },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // WhatsApp Tasks - MySQL: type, account_id, status, current_step, current_index, total_items, data, error, paused_at, resumed_at
    whatsapp_tasks: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'type', serverField: 'type' },
            { clientField: 'accountId', serverField: 'account_id', transform: validateId },
            { clientField: 'status', serverField: 'status', defaultValue: 'running' },
            { clientField: 'currentStep', serverField: 'current_step' },
            { clientField: 'currentIndex', serverField: 'current_index', defaultValue: 0 },
            { clientField: 'totalItems', serverField: 'total_items', defaultValue: 0 },
            { clientField: 'data', serverField: 'data', transform: (v: any) => v ? JSON.stringify(v) : null },
            { clientField: 'error', serverField: 'error' },
            { clientField: 'pausedAt', serverField: 'paused_at', transform: toMySQLDateTime },
            { clientField: 'resumedAt', serverField: 'resumed_at', transform: toMySQLDateTime },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Supervisors - MySQL: name, phone, email, is_active, notes
    supervisors: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'phone', serverField: 'phone' },
            { clientField: 'email', serverField: 'email' },
            { clientField: 'isActive', serverField: 'is_active', defaultValue: true },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Sales Reps - MySQL: name, phone, email, supervisor_id, commission_rate, is_active, notes
    sales_reps: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'phone', serverField: 'phone' },
            { clientField: 'email', serverField: 'email' },
            { clientField: 'supervisorId', serverField: 'supervisor_id', transform: validateId },
            { clientField: 'commissionRate', serverField: 'commission_rate', defaultValue: 0 },
            { clientField: 'isActive', serverField: 'is_active', defaultValue: true },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Deposits - SQLite: deposit_source_id, user_id, shift_id, amount, notes
    deposits: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'sourceId', serverField: 'deposit_source_id', transform: validateId },
            { clientField: 'depositSourceId', serverField: 'deposit_source_id', transform: validateId },
            { clientField: 'userId', serverField: 'user_id' },
            { clientField: 'shiftId', serverField: 'shift_id' },
            { clientField: 'amount', serverField: 'amount' },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'sourceName', 'userName'],
    },
    // Deposit Sources - SQLite: name, active
    deposit_sources: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Halls - SQLite: name, capacity, active
    halls: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'capacity', serverField: 'capacity', defaultValue: 0 },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Restaurant Tables - SQLite: hall_id, name, capacity, status, position_x, position_y, active
    restaurant_tables: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'hallId', serverField: 'hall_id', transform: validateId },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'capacity', serverField: 'capacity', defaultValue: 4 },
            { clientField: 'status', serverField: 'status', defaultValue: 'available' },
            { clientField: 'positionX', serverField: 'position_x', defaultValue: 0 },
            { clientField: 'positionY', serverField: 'position_y', defaultValue: 0 },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Promotions - SQLite: name, type, value, start_date, end_date, active
    promotions: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'type', serverField: 'type', defaultValue: 'discount' },
            { clientField: 'value', serverField: 'value', defaultValue: 0 },
            { clientField: 'startDate', serverField: 'start_date', transform: toMySQLDateTime },
            { clientField: 'endDate', serverField: 'end_date', transform: toMySQLDateTime },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Printers - SQLite: name, type, connection_type, address, port, active
    printers: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'type', serverField: 'type', defaultValue: 'receipt' },
            { clientField: 'connectionType', serverField: 'connection_type', defaultValue: 'usb' },
            { clientField: 'address', serverField: 'address' },
            { clientField: 'port', serverField: 'port' },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Payment Apps - SQLite: name, type, api_key, secret_key, active
    payment_apps: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'type', serverField: 'type' },
            { clientField: 'apiKey', serverField: 'api_key' },
            { clientField: 'secretKey', serverField: 'secret_key' },
            { clientField: 'active', serverField: 'active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Roles - SQLite: name, name_en, description, color, permissions, is_default
    roles: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'name', serverField: 'name' },
            { clientField: 'nameEn', serverField: 'name_en' },
            { clientField: 'description', serverField: 'description' },
            { clientField: 'color', serverField: 'color' },
            { clientField: 'permissions', serverField: 'permissions', transform: (v: any) => v ? JSON.stringify(v) : null },
            { clientField: 'isDefault', serverField: 'is_default', defaultValue: false },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Cash Movements - SQLite: shift_id, type, amount, reason, notes, created_by
    cash_movements: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'shiftId', serverField: 'shift_id', transform: validateId },
            { clientField: 'type', serverField: 'type' },
            { clientField: 'amount', serverField: 'amount' },
            { clientField: 'reason', serverField: 'reason' },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'userId', serverField: 'created_by' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'userName'],
    },
    // Purchase Returns - SQLite: purchase_id, supplier_id, total, return_date, reason, notes, created_by
    purchase_returns: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'originalPurchaseId', serverField: 'purchase_id', transform: validateId },
            { clientField: 'purchaseId', serverField: 'purchase_id', transform: validateId },
            { clientField: 'supplierId', serverField: 'supplier_id', transform: validateId },
            { clientField: 'totalAmount', serverField: 'total' },
            { clientField: 'total', serverField: 'total' },
            { clientField: 'returnDate', serverField: 'return_date', transform: toMySQLDateTime },
            { clientField: 'reason', serverField: 'reason' },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'userId', serverField: 'created_by' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'items', 'supplierName', 'purchaseNumber'],
    },
    // Purchase Payments - SQLite: purchase_id, supplier_id, amount, payment_date, payment_method_id, reference_number, notes, created_by
    purchase_payments: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'purchaseId', serverField: 'purchase_id', transform: validateId },
            { clientField: 'supplierId', serverField: 'supplier_id', transform: validateId },
            { clientField: 'amount', serverField: 'amount' },
            { clientField: 'paymentDate', serverField: 'payment_date', transform: toMySQLDateTime },
            { clientField: 'paymentMethodId', serverField: 'payment_method_id', transform: validateId },
            { clientField: 'referenceNumber', serverField: 'reference_number' },
            { clientField: 'notes', serverField: 'notes' },
            { clientField: 'userId', serverField: 'created_by' },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at', 'shiftId'],
    },
    // Users - MySQL: username, password_hash, full_name, email, phone, role, is_active
    users: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'username', serverField: 'username' },
            { clientField: 'password', serverField: 'password_hash', transform: (v: string) => {
                if (!v) return null;
                // If already a bcrypt hash, keep as-is
                if (v.startsWith('$2b$') || v.startsWith('$2a$')) return v;
                // Hash plaintext password
                return bcrypt.hashSync(v, 10);
            }},
            { clientField: 'name', serverField: 'full_name' },
            { clientField: 'email', serverField: 'email' },
            { clientField: 'phone', serverField: 'phone' },
            { clientField: 'role', serverField: 'role', defaultValue: 'cashier' },
            { clientField: 'active', serverField: 'is_active', defaultValue: true },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
    // Product Stock - SQLite: product_id, warehouse_id, quantity, min_quantity, max_quantity
    product_stock: {
        fields: [
            { clientField: 'id', serverField: 'id' },
            { clientField: 'productId', serverField: 'product_id', transform: validateId },
            { clientField: 'warehouseId', serverField: 'warehouse_id', transform: validateId },
            { clientField: 'quantity', serverField: 'quantity', defaultValue: 0 },
            { clientField: 'minQuantity', serverField: 'min_quantity', defaultValue: 0 },
            { clientField: 'maxQuantity', serverField: 'max_quantity', defaultValue: 0 },
            { clientField: 'createdAt', serverField: 'created_at', transform: toMySQLDateTime },
            { clientField: 'updatedAt', serverField: 'updated_at', transform: toMySQLDateTime },
        ],
        clientOnlyFields: ['local_updated_at'],
    },
};

// ==================== Transformation Functions ====================

export class FieldMapper {
    /**
     * Transform client data to server format
     */
    static clientToServer(
        tableName: string,
        clientData: Record<string, any>,
        clientId: string | number,
        branchId: string | number | null
    ): Record<string, any> {
        const mapping = TABLE_MAPPINGS[tableName];
        if (!mapping) {
            // No mapping defined - pass through with basic camelCase to snake_case conversion
            console.warn(`No field mapping defined for table: ${tableName}`);
            const serverData: Record<string, any> = { client_id: clientId, branch_id: branchId };
            for (const [key, value] of Object.entries(clientData)) {
                if (key === 'local_updated_at') continue;
                // Convert camelCase to snake_case
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                // Handle datetime
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
                    serverData[snakeKey] = toMySQLDateTime(value);
                } else {
                    serverData[snakeKey] = value;
                }
            }
            return serverData;
        }

        const serverData: Record<string, any> = {};

        // Apply field mappings
        for (const fieldMap of mapping.fields) {
            const clientValue = clientData[fieldMap.clientField];

            if (clientValue !== undefined) {
                const transformedValue = fieldMap.transform
                    ? fieldMap.transform(clientValue)
                    : clientValue;

                // Only set if we have a value (transforms may return null to skip)
                if (transformedValue !== undefined) {
                    serverData[fieldMap.serverField] = transformedValue;
                }
            } else if (fieldMap.defaultValue !== undefined) {
                serverData[fieldMap.serverField] = typeof fieldMap.defaultValue === 'function'
                    ? fieldMap.defaultValue()
                    : fieldMap.defaultValue;
            }
        }

        // Add required server fields
        serverData.client_id = clientId;
        
        // Tables that don't have branch_id column
        const noBranchTables = ['roles'];
        if (!noBranchTables.includes(tableName)) {
            serverData.branch_id = branchId;
        }

        // Add server defaults for missing fields
        if (mapping.serverDefaults) {
            for (const [field, defaultValue] of Object.entries(mapping.serverDefaults)) {
                if (serverData[field] === undefined) {
                    serverData[field] = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
                }
            }
        }

        // Remove client-only fields
        if (mapping.clientOnlyFields) {
            for (const field of mapping.clientOnlyFields) {
                delete serverData[field];
            }
        }

        return serverData;
    }

    /**
     * Transform server data to client format
     */
    static serverToClient(
        tableName: string,
        serverData: Record<string, any>
    ): Record<string, any> {
        const mapping = TABLE_MAPPINGS[tableName];
        if (!mapping) {
            return serverData;
        }

        const clientData: Record<string, any> = {};

        // Reverse mapping
        for (const fieldMap of mapping.fields) {
            // Skip client-to-server-only mappings (e.g., category name → category_id)
            if (fieldMap.clientToServerOnly) continue;

            const serverValue = serverData[fieldMap.serverField];

            if (serverValue !== undefined) {
                clientData[fieldMap.clientField] = serverValue;
            }
        }

        // Remove server-only metadata fields
        delete clientData.client_id;
        delete clientData.branch_id;
        delete clientData.sync_version;
        delete clientData.server_updated_at;
        delete clientData.is_deleted;

        return clientData;
    }

    /**
     * Get list of all supported tables
     */
    static getSupportedTables(): string[] {
        return Object.keys(TABLE_MAPPINGS);
    }

    /**
     * Check if table has mapping defined
     */
    static hasMapping(tableName: string): boolean {
        return tableName in TABLE_MAPPINGS;
    }
}
