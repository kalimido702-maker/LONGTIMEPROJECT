-- Migration 030: Fix missing columns for whatsapp_accounts, customer_bonuses, supervisor_bonuses
-- Addresses sync push failures reported in client logs

-- ==================== 1. WhatsApp Accounts: Add missing columns ====================
-- The original migration (013) created a minimal table. FieldMapper maps these columns
-- but they don't exist in MySQL, causing "Unknown column 'daily_limit'" errors.

ALTER TABLE whatsapp_accounts ADD COLUMN `name` VARCHAR(255) DEFAULT NULL;
ALTER TABLE whatsapp_accounts ADD COLUMN `daily_limit` INT DEFAULT 100;
ALTER TABLE whatsapp_accounts ADD COLUMN `daily_sent` INT DEFAULT 0;
ALTER TABLE whatsapp_accounts ADD COLUMN `last_reset_date` DATETIME DEFAULT NULL;
ALTER TABLE whatsapp_accounts ADD COLUMN `anti_spam_delay` INT DEFAULT 3000;
ALTER TABLE whatsapp_accounts ADD COLUMN `is_active` BOOLEAN DEFAULT FALSE;
ALTER TABLE whatsapp_accounts ADD COLUMN `last_connected_at` DATETIME DEFAULT NULL;

-- ==================== 2. Customer Bonuses: Ensure type column exists ====================
-- Migration 029 attempted this but may have failed if run after 026 (duplicate column).
-- Using a stored procedure for idempotent ADD COLUMN.

DROP PROCEDURE IF EXISTS add_column_if_not_exists;
CREATE PROCEDURE add_column_if_not_exists()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_name = 'customer_bonuses' AND column_name = 'type'
        AND table_schema = DATABASE()
    ) THEN
        ALTER TABLE customer_bonuses ADD COLUMN `type` VARCHAR(20) DEFAULT 'bonus' AFTER `branch_id`;
    END IF;
END;
CALL add_column_if_not_exists();
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
