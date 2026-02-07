-- ==================== Fix Sync Queue for SQLite ====================
-- Migration 014: Fix sync_queue to work with SQLite and add missing columns
-- This is a complete recreation since SQLite doesn't support ALTER TABLE well

-- Drop old sync_queue if exists and recreate with correct schema
DROP TABLE IF EXISTS sync_queue;

CREATE TABLE sync_queue (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36),
  device_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  payload TEXT DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sq_client_device ON sync_queue(client_id, device_id);
CREATE INDEX IF NOT EXISTS idx_sq_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sq_created_at ON sync_queue(created_at);

-- ==================== Add sync columns to customers if missing ====================
-- SQLite doesn't support IF NOT EXISTS for columns, so these may fail silently

-- ==================== Fix roles table ====================
-- Some tables might not have client_id/branch_id columns, create roles if missing
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36),
  branch_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  server_updated_at TEXT DEFAULT (datetime('now')),
  sync_version INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ==================== Add sync columns to invoice_items if needed ====================
-- This might fail if table structure doesn't match, which is fine
