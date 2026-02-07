-- ==================== Entity Tables Migration ====================
-- Additional POS Entity Tables
-- MySQL 8.0+
-- Created: 2025-12-07

-- ==================== Customers ====================

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  address TEXT,
  credit_limit DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_phone (phone),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Suppliers ====================

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  address TEXT,
  tax_number VARCHAR(50),
  credit_limit DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  payment_terms INT DEFAULT 0 COMMENT 'Payment terms in days',
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_phone (phone),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Payment Methods ====================

CREATE TABLE IF NOT EXISTS payment_methods (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  type ENUM('cash', 'card', 'transfer', 'wallet', 'other') DEFAULT 'cash',
  active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Invoices ====================

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  invoice_number VARCHAR(50) NOT NULL,
  customer_id VARCHAR(36),
  total DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  net_total DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  remaining_amount DECIMAL(10,2) DEFAULT 0,
  payment_status ENUM('paid', 'partial', 'unpaid') DEFAULT 'unpaid',
  invoice_date DATETIME NOT NULL,
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  UNIQUE KEY unique_invoice_number (client_id, invoice_number),
  INDEX idx_customer (customer_id),
  INDEX idx_invoice_date (invoice_date),
  INDEX idx_payment_status (payment_status),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Invoice Items ====================

CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(36) PRIMARY KEY,
  invoice_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX idx_invoice (invoice_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Purchases ====================

CREATE TABLE IF NOT EXISTS purchases (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  purchase_number VARCHAR(50) NOT NULL,
  supplier_id VARCHAR(36),
  total DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  net_total DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  remaining_amount DECIMAL(10,2) DEFAULT 0,
  payment_status ENUM('paid', 'partial', 'unpaid') DEFAULT 'unpaid',
  purchase_date DATETIME NOT NULL,
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  UNIQUE KEY unique_purchase_number (client_id, purchase_number),
  INDEX idx_supplier (supplier_id),
  INDEX idx_purchase_date (purchase_date),
  INDEX idx_payment_status (payment_status),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Purchase Items ====================

CREATE TABLE IF NOT EXISTS purchase_items (
  id VARCHAR(36) PRIMARY KEY,
  purchase_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX idx_purchase (purchase_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Expense Categories ====================

CREATE TABLE IF NOT EXISTS expense_categories (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Expenses ====================

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  category_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATETIME NOT NULL,
  payment_method_id VARCHAR(36),
  description TEXT,
  receipt_number VARCHAR(50),
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  INDEX idx_expense_date (expense_date),
  INDEX idx_category (category_id),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Employees ====================

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  user_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  position VARCHAR(100),
  salary DECIMAL(10,2) DEFAULT 0,
  hire_date DATE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Settings ====================

CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  setting_group VARCHAR(50) DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  UNIQUE KEY unique_setting (client_id, branch_id, setting_key),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_setting_group (setting_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record this migration
INSERT INTO migrations (name) VALUES ('002_entity_tables');
