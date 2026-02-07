-- ==================== Add Missing Sync Columns to Product Categories ====================
-- Migration to add client_id, branch_id, and sync columns to product_categories table
-- Compatible with both MySQL and SQLite

-- Add client_id column (required for sync)
ALTER TABLE product_categories ADD COLUMN client_id VARCHAR(36);

-- Add branch_id column (optional for sync)
ALTER TABLE product_categories ADD COLUMN branch_id VARCHAR(36);

-- Add server_updated_at column for sync
ALTER TABLE product_categories ADD COLUMN server_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Add sync_version column
ALTER TABLE product_categories ADD COLUMN sync_version INTEGER DEFAULT 1;

-- Add is_deleted column for soft delete
ALTER TABLE product_categories ADD COLUMN is_deleted INTEGER DEFAULT 0;

-- Add bonus_percentage column
ALTER TABLE product_categories ADD COLUMN bonus_percentage DECIMAL(5,2) DEFAULT 0;

-- Add parent_id column for subcategories support  
ALTER TABLE product_categories ADD COLUMN parent_id VARCHAR(36);

-- Add mixed_layout column for display options
ALTER TABLE product_categories ADD COLUMN mixed_layout INTEGER DEFAULT 0;

-- Record this migration
INSERT INTO migrations (name) VALUES ('019_add_sync_columns_product_categories');
