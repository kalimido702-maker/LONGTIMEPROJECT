-- ==================== Add Bonus Percentage to Product Categories ====================
-- Migration to add bonus_percentage, parent_id, mixed_layout fields to product_categories table
-- Compatible with both MySQL and SQLite

-- Add bonus_percentage column
ALTER TABLE product_categories ADD COLUMN bonus_percentage DECIMAL(5,2) DEFAULT 0;

-- Add parent_id column for subcategories support
ALTER TABLE product_categories ADD COLUMN parent_id VARCHAR(36) NULL;

-- Add mixed_layout column for display options
ALTER TABLE product_categories ADD COLUMN mixed_layout BOOLEAN DEFAULT FALSE;

-- Record this migration
INSERT INTO migrations (name) VALUES ('018_add_category_bonus_percentage');
