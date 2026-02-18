-- Migration: 023_add_items_json_to_invoices.sql
-- Add items_json and payment_method_amounts_json columns to invoices and purchases tables
-- This allows items to be stored directly in the invoice/purchase record for proper sync

-- Invoices: store items and payment method amounts as JSON
ALTER TABLE invoices ADD COLUMN items_json LONGTEXT;
ALTER TABLE invoices ADD COLUMN payment_method_amounts_json TEXT;
ALTER TABLE invoices ADD COLUMN customer_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN user_name VARCHAR(255);

-- Purchases: store items as JSON
ALTER TABLE purchases ADD COLUMN items_json LONGTEXT;

-- Note: Migration recording is handled automatically by MigrationRunner
