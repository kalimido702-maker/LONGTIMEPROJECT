-- Migration 035: Add missing columns needed by mobile API endpoints
-- The mobile invoice/payment creation routes reference these columns
-- but they were never added via previous migrations, causing 500 errors.

-- Invoices: add payment_method_id, payment_method_name, local_updated_at, is_synced
ALTER TABLE invoices ADD COLUMN payment_method_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN payment_method_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN local_updated_at TIMESTAMP DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN is_synced BOOLEAN DEFAULT FALSE;

-- Payments: add local_updated_at, is_synced
ALTER TABLE payments ADD COLUMN local_updated_at TIMESTAMP DEFAULT NULL;
ALTER TABLE payments ADD COLUMN is_synced BOOLEAN DEFAULT FALSE;
