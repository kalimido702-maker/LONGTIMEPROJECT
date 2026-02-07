-- Migration: Fix invoice_items client_id and branch_id column types
-- Problem: These columns are INT but should be VARCHAR(36) like other tables
-- This allows UUIDs to be stored correctly

-- First, modify client_id from INT to VARCHAR(36)
ALTER TABLE `invoice_items` 
MODIFY COLUMN `client_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;

-- Then, modify branch_id from INT to VARCHAR(36)
ALTER TABLE `invoice_items` 
MODIFY COLUMN `branch_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;

-- Add missing columns if they don't exist (sync_version and is_deleted should already exist from previous migration)
-- These are idempotent - they will fail silently if columns already exist
