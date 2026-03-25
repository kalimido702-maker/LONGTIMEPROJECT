-- Migration 030: Fix missing columns for whatsapp_accounts, customer_bonuses, supervisor_bonuses
-- Addresses sync push failures reported in client logs

-- ==================== 1. WhatsApp Accounts: Add missing columns ====================
ALTER TABLE whatsapp_accounts ADD COLUMN `name` VARCHAR(255) DEFAULT NULL;
ALTER TABLE whatsapp_accounts ADD COLUMN `daily_limit` INT DEFAULT 100;
ALTER TABLE whatsapp_accounts ADD COLUMN `daily_sent` INT DEFAULT 0;
ALTER TABLE whatsapp_accounts ADD COLUMN `last_reset_date` DATETIME DEFAULT NULL;
ALTER TABLE whatsapp_accounts ADD COLUMN `anti_spam_delay` INT DEFAULT 3000;
ALTER TABLE whatsapp_accounts ADD COLUMN `is_active` BOOLEAN DEFAULT FALSE;
ALTER TABLE whatsapp_accounts ADD COLUMN `last_connected_at` DATETIME DEFAULT NULL;

-- ==================== 2. Customer Bonuses: Ensure type column exists ====================
ALTER TABLE customer_bonuses ADD COLUMN `type` VARCHAR(20) DEFAULT 'bonus' AFTER `branch_id`;
