-- Migration: 006_settings_sync_columns.sql
-- Add sync-related columns to settings table

-- First check if settings table exists, if not create it
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT,
    `description` VARCHAR(255),
    `category` VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add sync columns to settings table (MySQL doesn't support IF NOT EXISTS for columns)
-- Run these one by one, ignore errors if column already exists
ALTER TABLE settings ADD COLUMN client_id CHAR(36);
ALTER TABLE settings ADD COLUMN branch_id CHAR(36);
ALTER TABLE settings ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN sync_version INT DEFAULT 1;
ALTER TABLE settings ADD COLUMN server_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add indexes for sync queries (ignore if exists)
CREATE INDEX idx_settings_client ON settings(client_id);
CREATE INDEX idx_settings_sync ON settings(client_id, branch_id, server_updated_at);

-- Drop unique constraint on customers phone
-- First find the constraint name with: SHOW INDEX FROM customers WHERE Column_name = 'phone';
-- Then drop it (common names: phone, idx_customers_phone, customers_phone_unique)
ALTER TABLE customers DROP INDEX phone;
