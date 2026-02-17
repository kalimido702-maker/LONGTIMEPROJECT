-- Migration 021: Add missing columns for product prices, units, payments, deposits, invoices
-- These fields were previously client-only and got lost during server sync

-- ==================== Products: prices JSON, unit_id, default_price_type_id, expiry_date ====================
ALTER TABLE products ADD COLUMN IF NOT EXISTS prices_json TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_price_type_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATETIME DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_multiple_units BOOLEAN DEFAULT FALSE;

-- ==================== Invoices: sales_rep_id, payment_type, shift_id ====================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_rep_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shift_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0;

-- ==================== Payments: payment_type for collection vs payment ====================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) DEFAULT NULL;

-- ==================== Deposits: ensure customer_id exists (should already from migration 013) ====================
-- Just in case, verify column exists
-- ALTER TABLE deposits ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) DEFAULT NULL;
