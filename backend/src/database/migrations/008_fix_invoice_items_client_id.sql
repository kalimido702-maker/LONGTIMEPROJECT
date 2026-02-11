-- Migration: Fix invoice_items client_id and branch_id column types
-- Add client_id and branch_id as VARCHAR(36) if they don't exist
-- If they exist as wrong type, modify them

-- Try to add client_id first (will be caught by error handler if exists)
ALTER TABLE `invoice_items` ADD COLUMN `client_id` varchar(36) DEFAULT NULL;

-- Try to add branch_id (will be caught by error handler if exists)
ALTER TABLE `invoice_items` ADD COLUMN `branch_id` varchar(36) DEFAULT NULL;
