-- ==================== Supervisors & Sales Reps Migration ====================
-- MySQL 8.0+
-- Created: 2026-01-11

-- ==================== Supervisors ====================

CREATE TABLE IF NOT EXISTS supervisors (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
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
  INDEX idx_is_active (is_active),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Sales Reps ====================

CREATE TABLE IF NOT EXISTS sales_reps (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  supervisor_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  commission_rate DECIMAL(5,2) DEFAULT 0 COMMENT 'Commission percentage',
  is_active BOOLEAN DEFAULT TRUE,
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
  FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE SET NULL,
  INDEX idx_supervisor (supervisor_id),
  INDEX idx_phone (phone),
  INDEX idx_is_active (is_active),
  INDEX idx_client_branch (client_id, branch_id),
  INDEX idx_server_updated_at (server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Update Customers Table ====================
-- Add missing fields for sales rep relationship and bonus tracking

ALTER TABLE customers
  ADD COLUMN sales_rep_id VARCHAR(36) DEFAULT NULL;

ALTER TABLE customers
  ADD COLUMN bonus_balance DECIMAL(10,2) DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN previous_statement DECIMAL(10,2) DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN loyalty_points INT DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN national_id VARCHAR(50) DEFAULT NULL;

-- Add foreign key for sales_rep_id
ALTER TABLE customers
  ADD CONSTRAINT fk_customer_sales_rep 
  FOREIGN KEY (sales_rep_id) REFERENCES sales_reps(id) ON DELETE SET NULL;

-- Add index for sales_rep_id
CREATE INDEX idx_customer_sales_rep ON customers(sales_rep_id);

-- Record this migration
INSERT INTO migrations (name) VALUES ('012_supervisors_salesreps');
