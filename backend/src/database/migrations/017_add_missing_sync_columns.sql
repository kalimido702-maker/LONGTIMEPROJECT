-- Migration 017: Add missing sync columns
-- Fixes sync errors for sales_returns and audit_logs

-- Add status column to sales_returns
ALTER TABLE sales_returns ADD COLUMN status VARCHAR(50) DEFAULT 'completed';

-- Add ref_id column to audit_logs
ALTER TABLE audit_logs ADD COLUMN ref_id VARCHAR(255);
