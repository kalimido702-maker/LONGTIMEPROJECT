-- Migration 021: Add missing columns for product prices, units, payments, deposits, invoices
-- These fields were previously client-only and got lost during server sync
-- Uses safe column addition that ignores errors for existing columns

-- Products columns
ALTER TABLE products ADD COLUMN prices_json TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN unit_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE products ADD COLUMN default_price_type_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE products ADD COLUMN expiry_date DATETIME DEFAULT NULL;
ALTER TABLE products ADD COLUMN has_multiple_units BOOLEAN DEFAULT FALSE;

-- Invoices columns
ALTER TABLE invoices ADD COLUMN sales_rep_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN shift_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN payment_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0;

-- Payments columns
ALTER TABLE payments ADD COLUMN payment_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE payments ADD COLUMN user_id VARCHAR(36) DEFAULT NULL
