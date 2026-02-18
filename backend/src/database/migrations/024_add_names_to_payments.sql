-- Migration: 024_add_names_to_payments.sql
-- Add customer_name, payment_method_name, user_name columns to payments table
-- This allows collections/payments to preserve display names after sync pull

ALTER TABLE payments ADD COLUMN customer_name VARCHAR(255);
ALTER TABLE payments ADD COLUMN payment_method_name VARCHAR(255);
ALTER TABLE payments ADD COLUMN user_name VARCHAR(255);

-- Note: Migration recording is handled automatically by MigrationRunner
