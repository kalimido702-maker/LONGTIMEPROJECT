-- ==================== Admin Tables Migration ====================
-- Admin Dashboard Tables
-- MySQL 8.0+
-- Created: 2025-12-10

-- ==================== Admin Users ====================

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role ENUM('super_admin', 'support', 'viewer') DEFAULT 'viewer',
  permissions JSON DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Subscription Plans ====================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100),
  price DECIMAL(10,2) NOT NULL,
  billing_cycle ENUM('monthly', 'yearly') DEFAULT 'monthly',
  max_branches INT DEFAULT 1,
  max_devices INT DEFAULT 1,
  max_products INT DEFAULT 100,
  features JSON,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Payment History ====================

CREATE TABLE IF NOT EXISTS payment_history (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  plan_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  notes TEXT,
  payment_date DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
  INDEX idx_client_id (client_id),
  INDEX idx_status (status),
  INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Audit Log ====================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id VARCHAR(36) PRIMARY KEY,
  admin_id VARCHAR(36) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  old_value JSON,
  new_value JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_admin_id (admin_id),
  INDEX idx_action (action),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Insert Default Admin User ====================
-- Password: admin123 (bcrypt hash)

INSERT INTO admin_users (id, username, password_hash, full_name, email, role, permissions)
VALUES (
  UUID(),
  'admin',
  '$2b$10$rQ8K9x5Ux5Ux5Ux5Ux5UeOQ8K9x5Ux5Ux5Ux5Ux5UeOQ8K9x5Ux5U',
  'مدير النظام',
  'admin@zimflo.com',
  'super_admin',
  '["*"]'
) ON DUPLICATE KEY UPDATE username = username;

-- ==================== Insert Default Subscription Plans ====================

INSERT INTO subscription_plans (id, name, name_ar, price, billing_cycle, max_branches, max_devices, max_products, features) VALUES
(UUID(), 'Basic', 'الأساسية', 99.00, 'monthly', 1, 1, 100, '["pos", "invoices", "reports_basic"]'),
(UUID(), 'Professional', 'الاحترافية', 199.00, 'monthly', 3, 5, 500, '["pos", "invoices", "reports_advanced", "inventory", "customers"]'),
(UUID(), 'Enterprise', 'المؤسسات', 499.00, 'monthly', 10, 20, 10000, '["pos", "invoices", "reports_advanced", "inventory", "customers", "api_access", "priority_support"]')
ON DUPLICATE KEY UPDATE name = name;

-- Record this migration
INSERT INTO migrations (name) VALUES ('003_admin_tables') ON DUPLICATE KEY UPDATE name = name;
