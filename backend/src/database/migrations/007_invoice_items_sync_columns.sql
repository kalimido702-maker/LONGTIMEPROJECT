-- Migration: Add sync columns to invoice_items table
-- This is needed for the sync system to work properly

ALTER TABLE `invoice_items` 
ADD COLUMN `sync_version` int DEFAULT 1,
ADD COLUMN `is_deleted` tinyint(1) DEFAULT 0;

-- Verify the changes
DESCRIBE `invoice_items`;
