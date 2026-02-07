-- ==================== Migration: Fix Sync Columns ====================
-- Adds missing columns for sync system
-- Created: 2026-02-05
-- Note: Errors for "column already exists" will be ignored by the runner

-- Fix invoice_items - add sync columns
ALTER TABLE invoice_items ADD COLUMN server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE invoice_items ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE invoice_items ADD COLUMN client_id VARCHAR(36);
ALTER TABLE invoice_items ADD COLUMN branch_id VARCHAR(36);

-- Fix purchase_items - add sync columns  
ALTER TABLE purchase_items ADD COLUMN server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE purchase_items ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE purchase_items ADD COLUMN client_id VARCHAR(36);
ALTER TABLE purchase_items ADD COLUMN branch_id VARCHAR(36);
ALTER TABLE purchase_items ADD COLUMN sync_version INT DEFAULT 1;
ALTER TABLE purchase_items ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

-- Fix sales_returns - add total_amount (frontend uses this name)
ALTER TABLE sales_returns ADD COLUMN total_amount DECIMAL(10,2);

-- Fix audit_logs - add entity (frontend uses this name, backend has entity_type)
ALTER TABLE audit_logs ADD COLUMN entity VARCHAR(100);
