-- Migration 029: Fix sync column issues
-- 1. Change payment_methods.type from ENUM to VARCHAR to support all client values
-- 2. Ensure customer_bonuses has type column

-- Fix payment_methods type column - change ENUM to VARCHAR(50)
ALTER TABLE payment_methods MODIFY COLUMN `type` VARCHAR(50) DEFAULT 'cash';

-- Add type column to customer_bonuses (will be ignored if already exists - ER_DUP_FIELDNAME)
ALTER TABLE customer_bonuses ADD COLUMN `type` VARCHAR(20) DEFAULT 'bonus' AFTER `id`;
