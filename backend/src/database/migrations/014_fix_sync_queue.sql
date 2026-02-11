-- ==================== Fix Sync Queue for MySQL ====================
-- Migration 014: Fix sync_queue to work properly

-- Drop old sync_queue if exists and recreate with correct schema
DROP TABLE IF EXISTS sync_queue;

CREATE TABLE IF NOT EXISTS sync_queue (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  device_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  operation ENUM('create', 'update', 'delete') NOT NULL,
  payload JSON,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  INDEX idx_sq_client_device (client_id, device_id),
  INDEX idx_sq_status (status),
  INDEX idx_sq_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== Fix roles table ====================
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  color VARCHAR(20),
  permissions JSON,
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
