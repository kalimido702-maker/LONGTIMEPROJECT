-- ==================== Complete Sync Tables Migration ====================
-- Add missing tables for sync system (SQLite compatible)
-- Created: 2026-01-19

-- ==================== Units (الوحدات) ====================
CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  symbol VARCHAR(20),
  is_base BOOLEAN DEFAULT FALSE,
  conversion_factor DECIMAL(10,4) DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Price Types (أنواع الأسعار) ====================
CREATE TABLE IF NOT EXISTS price_types (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Product Units (وحدات المنتجات) ====================
CREATE TABLE IF NOT EXISTS product_units (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  product_id VARCHAR(36) NOT NULL,
  unit_id VARCHAR(36) NOT NULL,
  barcode VARCHAR(100),
  selling_price DECIMAL(10,2),
  cost_price DECIMAL(10,2),
  conversion_factor DECIMAL(10,4) DEFAULT 1,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Warehouses (المستودعات) ====================
CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  address TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Product Stock (مخزون المنتجات) ====================
CREATE TABLE IF NOT EXISTS product_stock (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  product_id VARCHAR(36) NOT NULL,
  warehouse_id VARCHAR(36),
  quantity DECIMAL(10,2) DEFAULT 0,
  min_quantity DECIMAL(10,2) DEFAULT 0,
  max_quantity DECIMAL(10,2) DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Shifts (الورديات) ====================
CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  user_id VARCHAR(36),
  start_time TEXT NOT NULL,
  end_time TEXT,
  opening_cash DECIMAL(10,2) DEFAULT 0,
  closing_cash DECIMAL(10,2) DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0,
  total_refunds DECIMAL(10,2) DEFAULT 0,
  total_expenses DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'open',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Cash Movements (حركات الكاش) ====================
CREATE TABLE IF NOT EXISTS cash_movements (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  shift_id VARCHAR(36),
  type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Deposits (الإيداعات) ====================
CREATE TABLE IF NOT EXISTS deposits (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  customer_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  deposit_date TEXT NOT NULL,
  deposit_source_id VARCHAR(36),
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Deposit Sources (مصادر الإيداع) ====================
CREATE TABLE IF NOT EXISTS deposit_sources (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Payments (المدفوعات) ====================
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  invoice_id VARCHAR(36),
  customer_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method_id VARCHAR(36),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Purchase Payments (مدفوعات المشتريات) ====================
CREATE TABLE IF NOT EXISTS purchase_payments (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  purchase_id VARCHAR(36),
  supplier_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method_id VARCHAR(36),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Sales Returns (مرتجعات المبيعات) ====================
CREATE TABLE IF NOT EXISTS sales_returns (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  invoice_id VARCHAR(36),
  customer_id VARCHAR(36),
  return_number VARCHAR(50),
  total DECIMAL(10,2) NOT NULL,
  return_date TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Purchase Returns (مرتجعات المشتريات) ====================
CREATE TABLE IF NOT EXISTS purchase_returns (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  purchase_id VARCHAR(36),
  supplier_id VARCHAR(36),
  return_number VARCHAR(50),
  total DECIMAL(10,2) NOT NULL,
  return_date TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Expense Items (بنود المصروفات) ====================
CREATE TABLE IF NOT EXISTS expense_items (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  expense_id VARCHAR(36) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Employee Advances (سلف الموظفين) ====================
CREATE TABLE IF NOT EXISTS employee_advances (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  employee_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  advance_date TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Employee Deductions (خصومات الموظفين) ====================
CREATE TABLE IF NOT EXISTS employee_deductions (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  employee_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  deduction_date TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by VARCHAR(36),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Halls (الصالات) ====================
CREATE TABLE IF NOT EXISTS halls (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  capacity INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Restaurant Tables (طاولات المطعم) ====================
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  hall_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Promotions (العروض) ====================
CREATE TABLE IF NOT EXISTS promotions (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  type TEXT DEFAULT 'discount',
  value DECIMAL(10,2) DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Printers (الطابعات) ====================
CREATE TABLE IF NOT EXISTS printers (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  type TEXT DEFAULT 'receipt',
  connection_type TEXT DEFAULT 'usb',
  address VARCHAR(255),
  port INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Payment Apps (تطبيقات الدفع) ====================
CREATE TABLE IF NOT EXISTS payment_apps (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  type TEXT,
  api_key TEXT,
  secret_key TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Audit Logs (سجل العمليات) ====================
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(36),
  old_data TEXT,
  new_data TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== WhatsApp Tables ====================
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  phone VARCHAR(50),
  name VARCHAR(255),
  status TEXT DEFAULT 'disconnected',
  session_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  account_id VARCHAR(36),
  recipient VARCHAR(50),
  message TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'draft',
  scheduled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS whatsapp_tasks (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  campaign_id VARCHAR(36),
  recipient VARCHAR(50),
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Add sync columns to invoice_items ====================
-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- These will fail silently if columns already exist

-- ==================== Add sync columns to purchase_items ====================
-- Same note as above
