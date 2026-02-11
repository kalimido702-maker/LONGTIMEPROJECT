-- Migration 010: Packages System
-- Creates packages table and links to licenses

-- إنشاء جدول الباقات
CREATE TABLE IF NOT EXISTS packages (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    duration_months INT DEFAULT 12,
    max_products INT DEFAULT 100,
    max_users INT DEFAULT 1,
    max_branches INT DEFAULT 1,
    max_whatsapp_accounts INT DEFAULT 0,
    features JSON COMMENT 'Array of enabled feature IDs',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- إضافة عمود package_id لجدول licenses
-- Will be skipped by migration runner if column already exists
ALTER TABLE licenses ADD COLUMN package_id VARCHAR(36);

-- إضافة Foreign Key (تجاهل الخطأ إذا موجود)
-- ALTER TABLE licenses ADD CONSTRAINT fk_license_package 
--     FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL;

-- إدراج الباقات الافتراضية
INSERT INTO packages (id, name, name_ar, description, price, duration_months, max_products, max_users, max_branches, max_whatsapp_accounts, features, is_active) VALUES
-- Basic Package
(
    'pkg_basic_001',
    'Basic',
    'الباقة الأساسية',
    'للمتاجر الصغيرة - المميزات الأساسية للبيع',
    0,
    12,
    100,
    1,
    1,
    0,
    '["pos", "customers", "invoices", "inventory", "categories", "settings"]',
    TRUE
),
-- Pro Package
(
    'pkg_pro_001',
    'Pro',
    'الباقة الاحترافية',
    'للمتاجر المتوسطة - مميزات إدارية متقدمة',
    500,
    12,
    500,
    3,
    1,
    1,
    '["pos", "customers", "invoices", "inventory", "categories", "reports", "suppliers", "purchases", "employees", "employee_advances", "employee_deductions", "expense_categories", "expenses", "shifts", "sales_returns", "purchase_returns", "promotions", "settings"]',
    TRUE
),
-- Enterprise Package
(
    'pkg_enterprise_001',
    'Enterprise',
    'الباقة المتكاملة',
    'للشركات والفروع المتعددة - كل المميزات',
    1500,
    12,
    -1,  -- Unlimited products
    -1,  -- Unlimited users
    5,
    5,
    '["pos", "customers", "invoices", "inventory", "categories", "reports", "suppliers", "purchases", "employees", "employee_advances", "employee_deductions", "expense_categories", "expenses", "deposit_sources", "deposits", "shifts", "sales_returns", "purchase_returns", "promotions", "installments", "credit", "restaurant", "whatsapp", "whatsapp_campaigns", "settings", "roles_permissions"]',
    TRUE
);
